import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

type Section = {
  title: string;
  description: string;
  to: string;
  icon: ReactNode;
  /** Risk is the one section allowed to carry the warm half of the palette. */
  tone?: 'risk';
};

const icon = (path: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true">
    {path}
  </svg>
);

const sections: Section[] = [
  {
    title: 'Overview',
    description: 'What Farmenta is, who takes part, and how a loan moves from deposit to repayment.',
    to: '/docs/overview/how-it-works',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4l2.5 2.5" />
      </>,
    ),
  },
  {
    title: 'Concepts',
    description: 'Collateral, position valuation, price oracles, health factor, interest, fees and reserves.',
    to: '/docs/concepts/collateral',
    icon: icon(
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 15l3.5-4 3 2.5L19 8" />
      </>,
    ),
  },
  {
    title: 'Liquidations',
    description: 'When a loan can be liquidated, what the liquidator pays and receives, and how to run one.',
    to: '/docs/liquidations/overview',
    icon: icon(
      <>
        <path d="M12 3v18" />
        <path d="M5 8l7-5 7 5" />
        <path d="M4 14h6l-3 5z" />
        <path d="M14 14h6l-3 5z" />
      </>,
    ),
  },
  {
    title: 'Worked example',
    description: 'One loan followed from start to finish with real numbers, including a bad debt ending.',
    to: '/docs/worked-example',
    icon: icon(
      <>
        <rect x="4" y="3" width="16" height="18" rx="2.5" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h4" />
      </>,
    ),
  },
  {
    title: 'Technical reference',
    description: 'Contracts, functions, events, errors, risk parameters, addresses and indexer data.',
    to: '/docs/reference/architecture',
    icon: icon(
      <>
        <path d="M8 7l-5 5 5 5" />
        <path d="M16 7l5 5-5 5" />
        <path d="M13.5 4l-3 16" />
      </>,
    ),
  },
  {
    title: 'Risk and security',
    description: 'What is not protected today: owner powers, upgrade key, oracle limits and market risks.',
    to: '/docs/risk/overview',
    tone: 'risk',
    icon: icon(
      <>
        <path d="M12 3l8 3.5v5.2c0 4.6-3.2 8-8 9.3-4.8-1.3-8-4.7-8-9.3V6.5z" />
        <path d="M12 8.5v4.5" />
        <path d="M12 16.2v.1" />
      </>,
    ),
  },
];

const facts = [
  {label: 'Network', value: 'Robinhood Chain', note: 'Chain id 4663'},
  {label: 'Collateral', value: 'Uniswap v4 positions', note: 'The position NFT itself'},
  {label: 'Borrow asset', value: 'USDG', note: 'Supplied by lenders'},
  {label: 'Markets', value: 'Blue-chip and Meme', note: 'Fully isolated'},
];

function Hero() {
  const {siteConfig} = useDocusaurusContext();
  const logo = useBaseUrl('/img/farmenta-logo.png');
  return (
    <header className={styles.hero}>
      <img className={styles.heroEcho} src={logo} alt="" aria-hidden="true" />
      <div className={clsx('container', styles.heroInner)}>
        <img className={styles.heroLogo} src={logo} alt="Farmenta logo" width={84} height={84} />
        <p className={styles.eyebrow}>Documentation</p>
        <Heading as="h1" className={styles.heroTitle}>
          Borrow against your liquidity, <span className={styles.heroAccent}>keep your position</span>
        </Heading>
        <p className={styles.heroSubtitle}>{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/intro">
            Read the introduction
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/worked-example">
            Follow a worked example
          </Link>
        </div>
      </div>
    </header>
  );
}

function Facts() {
  return (
    <section className={clsx('container', styles.facts)} aria-label="Farmenta at a glance">
      {facts.map((fact) => (
        <div key={fact.label} className={styles.fact}>
          <span className={styles.factLabel}>{fact.label}</span>
          <span className={styles.factValue}>{fact.value}</span>
          <span className={styles.factNote}>{fact.note}</span>
        </div>
      ))}
    </section>
  );
}

function Sections() {
  return (
    <section className={clsx('container', styles.sections)}>
      <Heading as="h2" className={styles.sectionsTitle}>
        Find your way
      </Heading>
      <div className={styles.grid}>
        {sections.map((section) => (
          <Link
            key={section.title}
            to={section.to}
            className={clsx(styles.card, section.tone === 'risk' && styles.cardRisk)}>
            <span className={styles.cardIcon}>{section.icon}</span>
            <span className={styles.cardTitle}>{section.title}</span>
            <span className={styles.cardText}>{section.description}</span>
            <span className={styles.cardMore}>Open section</span>
          </Link>
        ))}
      </div>
      <p className={styles.resources}>
        Looking for a term or a quick answer? See the <Link to="/docs/resources/glossary">glossary</Link> and
        the <Link to="/docs/resources/faq">FAQ</Link>.
      </p>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title="Documentation" description={siteConfig.tagline}>
      <Hero />
      <main>
        <Facts />
        <Sections />
      </main>
    </Layout>
  );
}
