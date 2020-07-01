import { NextApiRequest, NextApiResponse } from 'next';
import algoliasearch, { SearchClient, SearchIndex } from 'algoliasearch/lite';
import { SearchOptions, SearchResponse } from '@algolia/client-search';
import {
  Org,
  User,
  UserJSON,
  SearchHit,
  Query,
  Timeslot,
  Option,
} from 'lib/model';

import to from 'await-to-js';

import { db, auth, DecodedIdToken, DocumentSnapshot } from './helpers/firebase';

const algoliaId: string = process.env.ALGOLIA_SEARCH_ID as string;
const algoliaKey: string = process.env.ALGOLIA_SEARCH_KEY as string;

const client: SearchClient = algoliasearch(algoliaId, algoliaKey);
const index: SearchIndex = client.initIndex(
  process.env.NODE_ENV === 'development' ? 'test-users' : 'default-users'
);

function addFilters(
  base: string,
  filters: Option<string>[],
  attr: string
): string {
  const addAND = base.length && !base.endsWith(' AND ') && filters.length;
  let filterString = addAND ? `${base} AND ` : base;
  for (let i = 0; i < filters.length; i += 1) {
    filterString += i === 0 ? '(' : ' OR ';
    filterString += `${attr}:"${filters[i].value}"`;
    if (i === filters.length - 1) filterString += ')';
  }
  return filterString;
}

/**
 * Creates and returns the filter string to search our Algolia index based on
 * `this.props.filters`. Note that due to Algolia restrictions, we **cannot**
 * nest ANDs with ORs (e.g. `(A AND B) OR (B AND C)`). Because of this
 * limitation, we merge results from many queries on the client side (e.g. get
 * results for `A AND B` and merge them with the results for `B AND C`).
 * @example
 * '(tutoring.subjects:"Chemistry H" OR tutoring.subjects:"Chemistry") AND ' +
 * '((availability.from <= 1587304800001 AND availability.to >= 1587322800000))'
 * @see {@link https://www.algolia.com/doc/guides/managing-results/refine-results/filtering/how-to/filter-by-date/?language=javascript}
 * @see {@link https://www.algolia.com/doc/guides/managing-results/refine-results/filtering/in-depth/combining-boolean-operators/#combining-ands-and-ors}
 * @see {@link https://www.algolia.com/doc/guides/managing-results/refine-results/filtering/how-to/filter-arrays/?language=javascript}
 */
function getFilterStrings(query: Query): string[] {
  let filterString =
    typeof query.visible === 'boolean'
      ? `visible=${query.visible ? 1 : 0}`
      : '';
  filterString = addFilters(
    filterString,
    query.subjects,
    `${query.aspect}.subjects`
  );
  filterString = addFilters(filterString, query.langs, 'langs');
  filterString = addFilters(filterString, query.checks, 'verifications.checks');
  filterString = addFilters(filterString, query.orgs, 'orgs');
  filterString = addFilters(filterString, query.tags, '_tags');
  if (query.availability.length) filterString += ' AND ';
  const filterStrings: string[] = [];
  query.availability.forEach((timeslot: Timeslot) =>
    filterStrings.push(
      `${filterString}(availability.from <= ${timeslot.from.valueOf()}` +
        ` AND availability.to >= ${timeslot.to.valueOf()})`
    )
  );
  if (!query.availability.length) filterStrings.push(filterString);
  return filterStrings;
}

/**
 * This is our way of showing the most relevant search results first without
 * paying for Algolia's visual editor.
 * @todo Show verified results first.
 * @see {@link https://www.algolia.com/doc/guides/managing-results/rules/merchandising-and-promoting/how-to/how-to-promote-with-optional-filters/}
 */
function getOptionalFilterStrings(query: Query): string[] {
  return [`featured:${query.aspect}`];
}

/**
 * Searches users based on the current filters by querying like:
 * > Show me all users whose availability contains a timeslot whose open time
 * > is equal to or before the desired open time and whose close time is equal
 * > to or after the desired close time.
 * Note that due to Algolia limitations, we must query for each availability
 * timeslot separately and then manually merge the results on the client side.
 */
async function searchUsers(query: Query): Promise<User[]> {
  const results: User[] = [];
  let filterStrings: (string | undefined)[] = getFilterStrings(query);
  if (!filterStrings.length) filterStrings = [undefined];
  const optionalFilters: string[] = getOptionalFilterStrings(query);
  console.log('[DEBUG] Filtering by:', { filterStrings, optionalFilters });
  await Promise.all(
    filterStrings.map(async (filterString) => {
      const options: SearchOptions | undefined = filterString
        ? { optionalFilters, filters: filterString }
        : { optionalFilters };
      const [err, res] = await to<SearchResponse<SearchHit>>(
        index.search('', options) as Promise<SearchResponse<SearchHit>>
      );
      if (err || !res) {
        /* eslint-disable-next-line @typescript-eslint/restrict-template-expressions */
        console.error(`[ERROR] While searching ${filterString}:`, err);
      } else {
        res.hits.forEach((hit: SearchHit) => {
          if (results.findIndex((h) => h.id === hit.objectID) < 0)
            results.push(User.fromSearchHit(hit));
        });
      }
    })
  );
  return results;
}

/**
 * For privacy reasons, we only add the user's first name and last initial to
 * our Algolia search index (and thus we **never** share the user's full name).
 * @example
 * assert(onlyFirstNameAndLastInitial('Nicholas Chiang') === 'Nicholas C.');
 * @todo Avoid code duplication from `algoliaUserUpdate` Firebase Function.
 */
function onlyFirstNameAndLastInitial(name: string): string {
  const split: string[] = name.split(' ');
  return `${split[0]} ${split[split.length - 1][0]}.`;
}

export type ListUsersRes = UserJSON[];

/**
 * Takes filter parameters (subjects and availability) and sends back an array
 * of `SearchResult`s that match the given filters.
 *
 * Note that we only send non-sensitive user information back to the client:
 * - User's first name and last initial
 * - User's bio (e.g. their education and experience)
 * - User's availability (for tutoring)
 * - User's subjects (what they can tutor)
 * - User's searches (what they need tutoring for)
 * - User's Firebase Authentication uID (as the Algolia `objectID`)
 *
 * We send full data back to client if and only if that data is owned by the
 * client's organization (i.e. the JWT sent belongs to a user whose a member of
 * an organization listed in the result's `orgs` field).
 *
 * Clients can only view users whose visibility is `true` **unless** those users
 * belong to the client's organization.
 */
export default async function listUsers(
  req: NextApiRequest,
  res: NextApiResponse<ListUsersRes>
): Promise<void> {
  console.log('[DEBUG] Getting search results...');
  const query: Query = Query.fromURLParams(req.query);
  const users: User[] = await searchUsers(query);
  const orgs: Org[] = [];
  if (req.headers.authorization) {
    const [err, token] = await to<DecodedIdToken>(
      auth.verifyIdToken(req.headers.authorization.replace('Bearer ', ''), true)
    );
    if (err) {
      console.warn('[WARNING] Firebase Authorization JWT invalid:', err);
    } else {
      (
        await db
          .collection('orgs')
          .where('members', 'array-contains', (token as DecodedIdToken).uid)
          .get()
      ).forEach((org: DocumentSnapshot) => orgs.push(Org.fromFirestore(org)));
    }
  }
  console.log(`[DEBUG] Got ${users.length} users.`);
  const results: UserJSON[] = users
    .filter((user: User) => {
      return user.visible || orgs.some(({ id }) => user.orgs.indexOf(id) >= 0);
    })
    .map((user: User) => {
      const truncated: UserJSON = {
        name: onlyFirstNameAndLastInitial(user.name),
        photo: user.photo,
        bio: user.bio,
        orgs: user.orgs,
        availability: user.availability.toJSON(),
        mentoring: user.mentoring,
        tutoring: user.tutoring,
        socials: user.socials,
        langs: user.langs,
        id: user.id,
      } as UserJSON;
      if (orgs.some(({ id }) => user.orgs.indexOf(id) >= 0))
        return user.toJSON();
      return truncated;
    });
  console.log(`[DEBUG] Got ${results.length} results.`);
  res.status(200).json(results);
}