import { v4 as uuid } from 'uuid';
import useSWR, { mutate } from 'swr';
import axios from 'axios';

import {
  DataTable,
  DataTableContent,
  DataTableHead,
  DataTableHeadCell,
  DataTableBody,
  DataTableRow,
} from '@rmwc/data-table';
import { TextField } from '@rmwc/textfield';
import { Select } from '@rmwc/select';
import { IconButton } from '@rmwc/icon-button';
import { ListApptsRes } from 'lib/api/list-appts';
import { ApptsQuery, Org, ApptJSON } from 'lib/model';
import { IntercomAPI } from 'components/react-intercom';
import { useMsg, IntlHelper } from 'lib/intl';
import { defineMessages } from 'react-intl';

import React from 'react';

import { ApptRow, LoadingRow } from './appt-row';

import Title from './title';
import Placeholder from './placeholder';

import styles from './dashboard.module.scss';

const msgs = defineMessages({
  title: {
    id: 'appts.title',
    defaultMessage: 'Appointments',
  },
  subtitle: {
    id: 'appts.subtitle',
    defaultMessage: "{name}'s upcoming appointments",
  },
  empty: {
    id: 'appts.empty',
    defaultMessage: 'NO APPOINTMENTS TO SHOW',
  },
  searchPlaceholder: {
    id: 'appts.filters.search-placeholder',
    defaultMessage: 'Search appointments',
  },
  importData: {
    id: 'appts.actions.import-data',
    defaultMessage: 'Import data',
  },
  importDataMsg: {
    id: 'appts.actions.import-data-msg',
    defaultMessage: 'Could you help me import appointment data?',
  },
});

interface ApptsProps {
  initialData: ListApptsRes;
  org: Org;
}

/**
 * The "Appts" view is a heterogenous combination of live-updating filtered
 * results and editability (similar to Google Sheets):
 * - Data automatically re-validates when filters are valid.
 * - Filters become invalid when data is edited or new users are being created.
 * - Creating new users locally updates the SWR data and calls the `/api/users`
 * API endpoint when the user has a valid email address.
 * - Local edits are pushed to remote after 5secs of no change.
 * @see {@link https://github.com/tutorbookapp/tutorbook/issues/87}
 * @see {@link https://github.com/tutorbookapp/tutorbook/issues/75}
 */
export default function Appts({ initialData, org }: ApptsProps): JSX.Element {
  const msg: IntlHelper = useMsg();
  const timeoutIds = React.useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  const [valid, setValid] = React.useState<boolean>(true);
  const [searching, setSearching] = React.useState<boolean>(false);
  const [query, setQuery] = React.useState<ApptsQuery>(
    new ApptsQuery({
      orgs: [{ label: org.name, value: org.id }],
      hitsPerPage: 10,
    })
  );

  const loadingRows: JSX.Element[] = React.useMemo(
    () =>
      Array(query.hitsPerPage)
        .fill(null)
        .map(() => <LoadingRow key={uuid()} />),
    [query.hitsPerPage]
  );

  // TODO: Control the re-validation using the `valid` state variable.
  // See: https://github.com/vercel/swr/issues/529
  const { data, isValidating } = useSWR<ListApptsRes>(query.endpoint, {
    initialData,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  React.useEffect(() => {
    setQuery((prev: ApptsQuery) => {
      return new ApptsQuery({
        ...prev,
        orgs: [{ label: org.name, value: org.id }],
      });
    });
  }, [org]);
  React.useEffect(() => {
    void mutate(query.endpoint);
  }, [query]);
  React.useEffect(() => {
    setSearching((prev: boolean) => prev && isValidating);
  }, [isValidating]);
  React.useEffect(() => {
    setValid((prev: boolean) => prev || searching);
  }, [searching]);

  const mutateAppt = React.useCallback(
    async (appt: ApptJSON) => {
      if (timeoutIds.current[appt.id]) {
        clearTimeout(timeoutIds.current[appt.id]);
        delete timeoutIds.current[appt.id];
      }

      const updateLocal = async (updated: ApptJSON, oldId?: string) => {
        await mutate(
          query.endpoint,
          (prev: ListApptsRes) => {
            if (!prev) return prev;
            const { appts: old } = prev;
            const idx = old.findIndex((u) => u.id === (oldId || updated.id));
            if (idx < 0) return prev;
            const appts = [
              ...old.slice(0, idx),
              updated,
              ...old.slice(idx + 1),
            ];
            return { ...prev, appts };
          },
          false
        );
      };

      const updateRemote = async (updated: ApptJSON) => {
        const url = `/api/users/${updated.id}`;
        const { data: remoteData } = await axios.put<ApptJSON>(url, updated);
        await updateLocal(remoteData);
      };

      setValid(false); // Filters become invalid when data is updated.
      await updateLocal(appt);

      // Only update the user profile remotely after 5secs of no change.
      // @see {@link https://github.com/vercel/swr/issues/482}
      timeoutIds.current[appt.id] = setTimeout(() => {
        void updateRemote(appt);
      }, 5000);
    },
    [query]
  );

  return (
    <>
      <Title
        header={msg(msgs.title)}
        body={msg(msgs.subtitle, { name: org.name })}
        actions={[
          {
            label: msg(msgs.importData),
            onClick: () =>
              IntercomAPI('showNewMessage', msg(msgs.importDataMsg)),
          },
        ]}
      />
      <div className={styles.wrapper}>
        <div className={styles.filters}>
          <div className={styles.left} />
          <div className={styles.right}>
            <TextField
              outlined
              invalid={!valid && !!query.query}
              placeholder={msg(msgs.searchPlaceholder)}
              className={styles.searchField}
              value={query.query}
              onChange={(event: React.FormEvent<HTMLInputElement>) => {
                const q: string = event.currentTarget.value;
                setSearching(true);
                setQuery((p) => new ApptsQuery({ ...p, query: q, page: 0 }));
              }}
            />
          </div>
        </div>
        {(searching || !!(data ? data.appts : []).length) && (
          <DataTable className={styles.table}>
            <DataTableContent>
              <DataTableHead className={styles.header}>
                <DataTableRow>
                  <DataTableHeadCell className={styles.message}>
                    Message
                  </DataTableHeadCell>
                  <DataTableHeadCell className={styles.subjects}>
                    Subjects
                  </DataTableHeadCell>
                  <DataTableHeadCell className={styles.tutors}>
                    Tutors
                  </DataTableHeadCell>
                  <DataTableHeadCell className={styles.tutees}>
                    Tutees
                  </DataTableHeadCell>
                  <DataTableHeadCell className={styles.mentors}>
                    Mentors
                  </DataTableHeadCell>
                  <DataTableHeadCell className={styles.mentees}>
                    Mentees
                  </DataTableHeadCell>
                  <DataTableHeadCell className={styles.parents}>
                    Parents
                  </DataTableHeadCell>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {!searching &&
                  (data ? data.appts : []).map((appt) => (
                    <ApptRow key={appt.id} appt={appt} onChange={mutateAppt} />
                  ))}
                {searching && loadingRows}
              </DataTableBody>
            </DataTableContent>
          </DataTable>
        )}
        {!searching && !(data ? data.appts : []).length && (
          <div className={styles.empty}>
            <Placeholder>{msg(msgs.empty)}</Placeholder>
          </div>
        )}
        <div className={styles.pagination}>
          <div className={styles.left} />
          <div className={styles.right}>
            <div className={styles.hitsPerPage}>
              Rows per page:
              <Select
                enhanced
                value={`${query.hitsPerPage}`}
                options={['5', '10', '15', '20', '25', '30']}
                onChange={(event: React.FormEvent<HTMLSelectElement>) => {
                  const hitsPerPage = Number(event.currentTarget.value);
                  const page = 0;
                  setSearching(true);
                  setQuery((p) => new ApptsQuery({ ...p, hitsPerPage, page }));
                }}
              />
            </div>
            <div className={styles.pageNumber}>
              {query.getPaginationString(data ? data.hits : 0)}
            </div>
            <IconButton
              disabled={query.page <= 0}
              icon='chevron_left'
              onClick={() => {
                setSearching(true);
                setQuery((p) => new ApptsQuery({ ...p, page: p.page - 1 }));
              }}
            />
            <IconButton
              disabled={
                query.page + 1 >= (data ? data.hits : 0) / query.hitsPerPage
              }
              icon='chevron_right'
              onClick={() => {
                setSearching(true);
                setQuery((p) => new ApptsQuery({ ...p, page: p.page + 1 }));
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
