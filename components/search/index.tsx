import React, { useState, useRef, useMemo, useEffect } from 'react';

import { useMsg } from 'lib/intl';
import { Callback, Option, Timeslot, User, UsersQuery } from 'lib/model';
import { defineMessages } from 'react-intl';
import { v4 as uuid } from 'uuid';

import Carousel from 'components/carousel';
import RequestDialog from 'components/request-dialog';
import Utils from 'lib/utils';
import Result from './result';
import Form from './form';

import styles from './search.module.scss';

interface SearchProps {
  onChange: Callback<UsersQuery>;
  results: ReadonlyArray<User>;
  searching: boolean;
  query: UsersQuery;
  user?: User;
}

const msgs = defineMessages({
  noResultsTitle: {
    id: 'search.no-results.title',
    defaultMessage: 'No Results',
  },
  noResultsBody: {
    id: 'search.no-results.body',
    defaultMessage:
      "We couldn't find anyone matching those filters. But here are some " +
      'suggestions:',
  },
});

export default function Search({
  user,
  query,
  results,
  searching,
  onChange,
}: SearchProps): JSX.Element {
  const [viewing, setViewing] = useState<User | undefined>(user);
  const [elevated, setElevated] = useState<boolean>(false);

  const msg = useMsg();
  const formRef = useRef<HTMLDivElement | null>();
  const noResultsQuery = useMemo(() => {
    return new UsersQuery({ aspect: query.aspect, visible: true });
  }, [query.aspect]);

  useEffect(() => {
    const listener = () => {
      if (!formRef.current) return;
      const viewportOffset = formRef.current.getBoundingClientRect();
      const updated: boolean = viewportOffset.top <= 74;
      // We have to wait a tick before changing the class for the animation to
      // work. @see {@link https://stackoverflow.com/a/37643388/10023158}
      if (updated !== elevated) setTimeout(() => setElevated(updated), 100);
    };
    window.addEventListener('scroll', listener);
    return () => window.removeEventListener('scroll', listener);
  });

  return (
    <div className={styles.wrapper}>
      {viewing && (
        <RequestDialog
          user={viewing}
          aspect={query.aspect}
          onClosed={() => setViewing(undefined)}
          subjects={Utils.intersection<string, Option<string>>(
            viewing[query.aspect].subjects,
            query.subjects,
            (a: string, b: Option<string>) => a === b.value
          )}
          time={
            Utils.intersection<Timeslot, Timeslot>(
              query.availability,
              viewing.availability,
              (a: Timeslot, b: Timeslot) => a.equalTo(b)
            )[0]
          }
        />
      )}
      <Form query={query} onChange={onChange} />
      {searching && !results.length && (
        <ul className={styles.results}>
          {Array(5)
            .fill(null)
            .map(() => (
              <Result loading key={uuid()} />
            ))}
        </ul>
      )}
      {!!results.length && (
        <ul className={styles.results}>
          {results.map((res: User) => (
            <Result
              user={res}
              key={res.id || uuid()}
              onClick={() => setViewing(res)}
            />
          ))}
        </ul>
      )}
      {!searching && !results.length && (
        <div className={styles.noResults}>
          <h3 className={styles.noResultsHeader}>{msg(msgs.noResultsTitle)}</h3>
          <p className={styles.noResultsBody}>{msg(msgs.noResultsBody)}</p>
          <Carousel query={noResultsQuery} onClick={setViewing} />
        </div>
      )}
    </div>
  );
}
