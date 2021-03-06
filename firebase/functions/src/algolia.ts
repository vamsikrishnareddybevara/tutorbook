import { config, Change, EventContext } from 'firebase-functions';
import { Settings } from '@algolia/client-search';
import algoliasearch, { SearchClient, SearchIndex } from 'algoliasearch';
import to from 'await-to-js';
import admin from 'firebase-admin';

/**
 * We don't have to provide any authentication for this because it's already
 * included as environment variables in the GCP function Node.js runtime.
 * @see {@link https://bit.ly/3eXZeOz}
 */
admin.initializeApp();

type DocumentReference = admin.firestore.DocumentReference;
type DocumentSnapshot = admin.firestore.DocumentSnapshot;
type Timestamp = admin.firestore.Timestamp;

const client: SearchClient = algoliasearch(
  (config().algolia as Record<'id' | 'key', string>).id,
  (config().algolia as Record<'id' | 'key', string>).key
);

interface Timeslot<T> {
  from: T;
  to: T;
}

/**
 * All of the tags that are added to the users search index during indexing
 * (i.e. when this function runs).
 * @see src/model/user.ts
 */
const NOT_VETTED = 'not-vetted';

/**
 * Convert the availability objects (i.e. the user's schedule and availability)
 * to arrays of Unix timestamp numbers that can then be queryed like:
 * > Show me all users whose availability contains a timeslot whose open time
 * > is equal to or before the desired open time and whose close time is equal
 * > to or after the desired close time.
 * @see {@link https://firebase.google.com/docs/reference/node/firebase.firestore.Timestamp#tomillis}
 * @see {@link https://www.algolia.com/doc/guides/managing-results/refine-results/filtering/how-to/filter-by-date/?language=javascript#after}
 */
function timeslot(time: Timeslot<Timestamp>): Timeslot<number> {
  return { from: time.from.toMillis(), to: time.to.toMillis() };
}
function availability(times: Timeslot<Timestamp>[]): Timeslot<number>[] {
  return times.map(timeslot);
}

/**
 * We use Algolia's tagging feature to support some otherwise impossible
 * querying logic (i.e. the logic is run here, during indexing time, and then
 * can be queried later).
 */
function tags(user: Record<string, unknown>): string[] {
  const tgs: string[] = [];
  if (!((user.verifications as unknown[]) || []).length) tgs.push(NOT_VETTED);
  return tgs;
}

/**
 * Wrapper for the `await-to-js` function that enables use with Algolia's custom
 * "pending request" objects.
 */
function too<T, U = Error>(p: any): Promise<[U | null, T | undefined]> {
  return to<T, U>((p as unknown) as Promise<T>);
}

/**
 * Updates the settings on a given Algolia index and catches and logs any
 * errors.
 */
async function updateSettings(
  index: SearchIndex,
  settings: Settings
): Promise<void> {
  console.log(`[DEBUG] Updating search index (${index.indexName}) settings...`);
  const [err] = await too(index.setSettings(settings));
  if (err) {
    console.error(`[ERROR] ${err.name} while updating:`, err);
  } else {
    console.log(`[DEBUG] Updated search index (${index.indexName}) settings.`);
  }
}

async function updateFilterableAttributes(
  index: SearchIndex,
  attributes: string[]
): Promise<void> {
  const attributesForFaceting = attributes.map((attr) => `filterOnly(${attr})`);
  return updateSettings(index, { attributesForFaceting });
}

function handles(appt: Record<string, unknown>): string[] {
  const creatorHandle = (appt.creator as { handle: string }).handle;
  const attendeeHandles = (appt.attendees as { handle: string }[]).map(
    ({ handle }) => handle
  );
  return [creatorHandle, ...attendeeHandles];
}

export async function apptUpdate(
  change: Change<DocumentSnapshot>,
  context: EventContext
): Promise<void> {
  const db: DocumentReference = admin
    .firestore()
    .collection('partitions')
    .doc(context.params.partition);

  /**
   * Gets the orgs for a given appointment. We add all of the orgs that each
   * appointment attendee is a part of during indexing. This allows us to filter
   * by org at search time (i.e. when we want to populate an org admin dashboard).
   * @param appt - The appointment to fetch orgs for.
   * @return A list of org IDs that the `appt` attendees are a part of.
   */
  async function orgs(appt: Record<string, unknown>): Promise<string[]> {
    const ids: Set<string> = new Set();
    await Promise.all(
      (appt.attendees as { id: string }[]).map(async ({ id }) => {
        const doc = await db.collection('users').doc(id).get();
        if (!doc.exists) {
          console.warn(`[WARNING] Attendee (${id}) doesn't exist.`);
        } else {
          (doc.data() as { orgs: string[] }).orgs.forEach((o) => ids.add(o));
        }
      })
    );
    console.log(`[DEBUG] Got orgs for appt (${appt.id as string}):`, ids);
    return Array.from(ids);
  }

  const id: string = context.params.appt as string;
  const indexId = `${context.params.partition as string}-appts`;
  const index: SearchIndex = client.initIndex(indexId);
  if (!change.after.exists) {
    console.log(`[DEBUG] Deleting appt (${id})...`);
    const [err] = await too(index.deleteObject(id));
    if (err) {
      console.error(`[ERROR] ${err.name} while deleting:`, err);
    } else {
      console.log(`[DEBUG] Deleted appt (${id}).`);
    }
  } else {
    const appt = change.after.data() as Record<string, unknown>;
    console.log(`[DEBUG] Updating appt (${id})...`);
    const ob: Record<string, unknown> = {
      ...appt,
      time: appt.time ? timeslot(appt.time as Timeslot<Timestamp>) : undefined,
      handles: handles(appt),
      orgs: await orgs(appt),
      objectID: id,
    };
    const [err] = await too(index.saveObject(ob));
    if (err) {
      console.error(`[ERROR] ${err.name} while updating:`, err);
    } else {
      console.log(`[DEBUG] Updated appt (${id}).`);
    }
  }
  await updateFilterableAttributes(index, ['handles', 'orgs']);
}

/**
 * We sync our Firestore database with Algolia in order to perform SQL-like
 * search operations (and to easily enable full-text search OFC).
 *
 * @todo This GCP function is triggered every time a `users` document is
 * updated. In the future, we should just combine this with the update user REST
 * API endpoint.
 */
export async function userUpdate(
  change: Change<DocumentSnapshot>,
  context: EventContext
): Promise<void> {
  const uid: string = context.params.user as string;
  const indexId = `${context.params.partition as string}-users`;
  const index: SearchIndex = client.initIndex(indexId);
  if (!change.after.exists) {
    console.log(`[DEBUG] Deleting user (${uid})...`);
    const [err] = await too(index.deleteObject(uid));
    if (err) {
      console.error(`[ERROR] ${err.name} while deleting:`, err);
    } else {
      console.log(`[DEBUG] Deleted user (${uid}).`);
    }
  } else {
    const user = change.after.data() as Record<string, unknown>;
    console.log(`[DEBUG] Updating ${user.name as string} (${uid})...`);
    const ob: Record<string, unknown> = {
      ...user,
      availability: availability(user.availability as Timeslot<Timestamp>[]),
      visible: !!user.visible,
      _tags: tags(user),
      objectID: uid,
    };
    const [err] = await too(index.saveObject(ob));
    if (err) {
      console.error(`[ERROR] ${err.name} while updating:`, err);
    } else {
      console.log(`[DEBUG] Updated ${user.name as string} (${uid}).`);
    }
  }
  // Note that we don't have to add the `visible` property here (b/c Algolia
  // automatically supports filtering by numeric and boolean values).
  await updateFilterableAttributes(index, [
    'orgs',
    'parents',
    'availability',
    'mentoring.subjects',
    'mentoring.searches',
    'tutoring.subjects',
    'tutoring.searches',
    'verifications.checks',
    'langs',
    'featured',
  ]);
}
