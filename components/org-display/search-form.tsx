import { useIntl, useMsg, IntlHelper, Msg } from 'lib/intl';
import { Aspect, UsersQuery, Availability, OrgJSON } from 'lib/model';
import { defineMessages } from 'react-intl';

import React from 'react';
import Router from 'next/router';
import Button from 'components/button';
import QueryForm from 'components/query-form';

import styles from './search-form.module.scss';

interface SearchFormProps {
  aspect: Aspect;
  org: OrgJSON;
}

const msgs: Record<string, Msg> = defineMessages({
  mentoringBtn: {
    id: 'org-display.search-form.mentoring.btn',
    defaultMessage: 'Search {name} mentors',
  },
  tutoringBtn: {
    id: 'org-display.search-form.tutoring.btn',
    defaultMessage: 'Search {name} tutors',
  },
});

export default function SearchForm({
  aspect,
  org,
}: SearchFormProps): JSX.Element {
  const { locale } = useIntl();
  const msg: IntlHelper = useMsg();

  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [query, setQuery] = React.useState<UsersQuery>(
    new UsersQuery({
      aspect: aspect || 'mentoring',
      langs: [], // TODO: Pre-fill with current locale language.
      subjects: [],
      availability: new Availability(),
    })
  );

  React.useEffect(() => {
    setQuery((prev: UsersQuery) => {
      if (!aspect || aspect === prev.aspect) return prev;
      return new UsersQuery({ ...prev, aspect });
    });
  }, [aspect]);

  React.useEffect(() => {
    void Router.prefetch(
      '/[locale]/[org]/search/[[...slug]]',
      `/${locale}/${org.id}${query.url}`
    );
  }, [query, locale]);

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setSubmitting(true);
      await Router.push(
        '/[locale]/[org]/search/[[...slug]]',
        `/${locale}/${org.id}${query.url}`
      );
    },
    [query, locale]
  );
  const onChange = React.useCallback((qry: UsersQuery) => setQuery(qry), []);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <QueryForm
        subjects
        vertical
        availability={query.aspect === 'tutoring'}
        onChange={onChange}
        query={query}
      />
      <Button
        className={styles.button}
        label={msg(msgs[`${query.aspect}Btn`], { name: org.name })}
        disabled={submitting}
        raised
        arrow
      />
    </form>
  );
}
