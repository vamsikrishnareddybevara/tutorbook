import { useIntl, Link, IntlShape, IntlHelper, Msg } from 'lib/intl';
import { UsersQuery, Aspect, Callback } from 'lib/model';
import { defineMessages } from 'react-intl';
import { useUser } from 'lib/account';

import React from 'react';
import Avatar from 'components/avatar';
import FilterForm from 'components/filter-form';
import PopOver from './pop-over';
import Switcher from './switcher';
import Tabs, { TabsProps } from './tabs';

import styles from './header.module.scss';

const tabLabels: Record<Aspect, Msg> = defineMessages({
  mentoring: {
    id: 'header.tabs.mentoring',
    defaultMessage: 'Mentors',
  },
  tutoring: {
    id: 'header.tabs.tutoring',
    defaultMessage: 'Tutors',
  },
});

function DesktopTabs({
  aspect,
  onChange,
}: {
  aspect: Aspect;
  onChange: Callback<Aspect>;
}): JSX.Element {
  const intl: IntlShape = useIntl();
  const msg: IntlHelper = (message: Msg) => intl.formatMessage(message);
  return (
    <Tabs
      tabs={[
        {
          label: msg(tabLabels.mentoring),
          active: aspect === 'mentoring',
          onClick: () => onChange('mentoring'),
        },
        {
          label: msg(tabLabels.tutoring),
          active: aspect === 'tutoring',
          onClick: () => onChange('tutoring'),
        },
      ]}
    />
  );
}

function DesktopTabLinks(): JSX.Element {
  const intl: IntlShape = useIntl();
  const msg: IntlHelper = (message: Msg) => intl.formatMessage(message);
  return (
    /* eslint-disable jsx-a11y/anchor-is-valid */
    <div className={styles.desktopLinks}>
      <Link href='/search/[[...slug]]' as='/search?aspect=mentoring'>
        <a className={styles.desktopLink}>{msg(tabLabels.mentoring)}</a>
      </Link>
      <Link href='/search/[[...slug]]' as='/search?aspect=tutoring'>
        <a className={styles.desktopLink}>{msg(tabLabels.tutoring)}</a>
      </Link>
    </div>
    /* eslint-enable jsx-a11y/anchor-is-valid */
  );
}

function Logo(): JSX.Element {
  const { user } = useUser();
  return (
    /* eslint-disable jsx-a11y/anchor-is-valid */
    <Link href={user.id ? '/dashboard' : '/'}>
      <a className={styles.logo}>
        <span>TB</span>
      </a>
    </Link>
    /* eslint-enable jsx-a11y/anchor-is-valid */
  );
}

function MobileNav(): JSX.Element {
  const { user } = useUser();
  const [active, setActive] = React.useState<boolean>(false);
  const toggleMobileMenu = () => {
    const menuActive = !active;
    if (menuActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    setActive(menuActive);
  };
  return (
    /* eslint-disable jsx-a11y/anchor-is-valid */
    <>
      <div
        className={styles.mobileToggle}
        onClick={toggleMobileMenu}
        role='button'
      >
        <div
          className={styles.toggle + (active ? ` ${styles.toggleActive}` : '')}
        />
      </div>
      <nav
        className={
          styles.mobileNav + (active ? ` ${styles.mobileNavActive}` : '')
        }
      >
        <ul className={styles.mobileLinks}>
          <Link href='/signup'>
            <a className={styles.mobileLink}>
              <li className={styles.mobileLinkItem}>
                {user.id ? 'Profile' : 'Signup'}
              </li>
            </a>
          </Link>
        </ul>
      </nav>
    </>
    /* eslint-enable jsx-a11y/anchor-is-valid */
  );
}

function DesktopNav(): JSX.Element {
  const { user } = useUser();
  const [open, setOpen] = React.useState<boolean>(false);
  return (
    /* eslint-disable jsx-a11y/anchor-is-valid */
    <div className={styles.desktopLinks}>
      {!user.id && (
        <>
          <Link href='/login'>
            <a className={`${styles.desktopLink} ${styles.loginLink}`}>Login</a>
          </Link>
          <Link href='/signup'>
            <a className={`${styles.desktopLink} ${styles.signupLink}`}>
              Signup
            </a>
          </Link>
        </>
      )}
      {!!user.id && (
        <PopOver open={open} onClose={() => setOpen(false)}>
          <button
            type='button'
            className={styles.avatar}
            onClick={() => setOpen(true)}
          >
            <Avatar src={user.photo} />
          </button>
        </PopOver>
      )}
    </div>
    /* eslint-enable jsx-a11y/anchor-is-valid */
  );
}

export function TabHeader(props: TabsProps): JSX.Element {
  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div className={styles.left}>
          <Logo />
          <Switcher />
          <Tabs {...props} />
        </div>
        <div className={styles.right}>
          <DesktopTabLinks />
          <DesktopNav />
        </div>
      </header>
    </div>
  );
}

interface LinkHeaderProps {
  formWidth?: boolean;
}

export function LinkHeader({ formWidth }: LinkHeaderProps): JSX.Element {
  return (
    <div className={styles.wrapper + (formWidth ? ` ${styles.formWidth}` : '')}>
      <header className={styles.header}>
        <div className={styles.left}>
          <Logo />
          <DesktopTabLinks />
        </div>
        <div className={styles.right}>
          <MobileNav />
          <DesktopNav />
        </div>
      </header>
    </div>
  );
}

interface AspectHeaderProps extends LinkHeaderProps {
  aspect: Aspect;
  onChange: Callback<Aspect>;
}

export function AspectHeader({
  aspect,
  onChange,
  formWidth,
}: AspectHeaderProps): JSX.Element {
  return (
    <div className={styles.wrapper + (formWidth ? ` ${styles.formWidth}` : '')}>
      <header className={styles.header}>
        <div className={styles.left}>
          <Logo />
          <DesktopTabs aspect={aspect} onChange={onChange} />
        </div>
        <div className={styles.right}>
          <MobileNav />
          <DesktopNav />
        </div>
      </header>
    </div>
  );
}

interface QueryHeaderProps extends LinkHeaderProps {
  query: UsersQuery;
  onChange: Callback<UsersQuery>;
}

export function QueryHeader({
  query,
  onChange,
  formWidth,
}: QueryHeaderProps): JSX.Element {
  return (
    <div className={styles.wrapper + (formWidth ? ` ${styles.formWidth}` : '')}>
      <header className={styles.header}>
        <div className={styles.left}>
          <Logo />
          <DesktopTabs
            aspect={query.aspect}
            onChange={(aspect: Aspect) =>
              onChange(new UsersQuery({ ...query, aspect }))
            }
          />
        </div>
        <div className={styles.center}>
          <FilterForm query={query} onChange={onChange} />
        </div>
        <div className={styles.right}>
          <MobileNav />
          <DesktopNav />
        </div>
      </header>
    </div>
  );
}
