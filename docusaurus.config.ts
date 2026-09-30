import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type {PrismTheme} from 'prism-react-renderer';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Where this site is served from.
const SITE_URL = process.env.DOCS_URL ?? 'https://docs.farmenta.fun';

// Where the "Launch App" button points. FARMENTA_APP_URL overrides it, for
// example to point at a local frontend while developing.
const APP_URL = process.env.FARMENTA_APP_URL ?? 'https://farmenta.fun/';

const GITHUB_ORG = 'https://github.com/farmenta-defi';
const EXPLORER_URL = 'https://robinhoodchain.blockscout.com';

// Code colours stay on the cold half of the palette. Orange and red mean risk
// everywhere else on the site, so syntax highlighting never uses them.
const farmentaPrism: PrismTheme = {
  plain: {color: '#e9eff8', backgroundColor: '#0b1220'},
  styles: [
    {types: ['comment', 'prolog', 'doctype', 'cdata'], style: {color: '#64768f', fontStyle: 'italic'}},
    {types: ['punctuation', 'operator'], style: {color: '#8496b0'}},
    {types: ['keyword', 'builtin', 'important', 'atrule', 'selector'], style: {color: '#6ecbff'}},
    {types: ['function', 'class-name', 'tag'], style: {color: '#00b9fd'}},
    {types: ['string', 'char', 'attr-value', 'inserted'], style: {color: '#a8dfff'}},
    {types: ['number', 'boolean', 'constant', 'symbol'], style: {color: '#d8efff'}},
    {types: ['property', 'attr-name', 'variable'], style: {color: '#b3c2d6'}},
    {types: ['deleted'], style: {color: '#8496b0', textDecorationLine: 'line-through'}},
  ],
};

const config: Config = {
  title: 'Farmenta Docs',
  tagline: 'Borrow USDG against your Uniswap v4 liquidity positions, without closing them.',
  favicon: 'img/favicon.png',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  url: SITE_URL,
  baseUrl: '/',

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    // Every page is parsed as MDX, which is what renders callouts and themed
    // code blocks. In prose, `<` and `{` must sit inside backticks.
    format: 'mdx',
    mermaid: true,
    hooks: {
      // Strict in a build, lenient in `pnpm start` so a page that links to one
      // still being written does not take the dev server down.
      onBrokenMarkdownLinks: process.env.NODE_ENV === 'development' ? 'warn' : 'throw',
    },
  },

  stylesheets: [
    {
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap',
      type: 'text/css',
    },
  ],

  headTags: [
    {tagName: 'link', attributes: {rel: 'preconnect', href: 'https://fonts.googleapis.com'}},
    {
      tagName: 'link',
      attributes: {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous'},
    },
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          showLastUpdateTime: false,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/docs',
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
      },
    ],
  ],

  themeConfig: {
    image: 'img/farmenta-logo.png',
    metadata: [
      {
        name: 'description',
        content:
          'Documentation for Farmenta, a lending protocol on Robinhood Chain that accepts Uniswap v4 liquidity positions as collateral.',
      },
    ],
    // The Farmenta app is dark only, and so is its documentation.
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: false,
      },
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 3,
    },
    navbar: {
      title: 'Farmenta',
      hideOnScroll: false,
      logo: {
        alt: 'Farmenta logo',
        src: 'img/farmenta-logo.png',
        width: 30,
        height: 30,
      },
      items: [
        {type: 'doc', docId: 'intro', position: 'left', label: 'Docs'},
        {type: 'doc', docId: 'concepts/collateral', position: 'left', label: 'Concepts'},
        {type: 'doc', docId: 'liquidations/overview', position: 'left', label: 'Liquidations'},
        {type: 'doc', docId: 'reference/architecture', position: 'left', label: 'Reference'},
        {type: 'doc', docId: 'risk/overview', position: 'left', label: 'Risk'},
        {href: `${GITHUB_ORG}/smart-contract`, label: 'GitHub', position: 'right'},
        {
          href: APP_URL,
          label: 'Launch App',
          position: 'right',
          className: 'navbar-launch-app',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Learn',
          items: [
            {label: 'Introduction', to: '/docs/intro'},
            {label: 'How it works', to: '/docs/overview/how-it-works'},
            {label: 'Worked example', to: '/docs/worked-example'},
            {label: 'Glossary', to: '/docs/resources/glossary'},
            {label: 'FAQ', to: '/docs/resources/faq'},
          ],
        },
        {
          title: 'Protocol',
          items: [
            {label: 'Health factor', to: '/docs/concepts/health-factor'},
            {label: 'Liquidations', to: '/docs/liquidations/overview'},
            {label: 'Risk parameters', to: '/docs/reference/risk-parameters'},
            {label: 'Risk overview', to: '/docs/risk/overview'},
          ],
        },
        {
          title: 'Build',
          items: [
            {label: 'Contract architecture', to: '/docs/reference/architecture'},
            {label: 'Contract addresses', to: '/docs/reference/addresses'},
            {label: 'Smart contracts on GitHub', href: `${GITHUB_ORG}/smart-contract`},
            {label: 'Indexer on GitHub', href: `${GITHUB_ORG}/indexer`},
          ],
        },
        {
          title: 'Network',
          items: [
            {label: 'Launch App', href: APP_URL},
            {label: 'Robinhood Chain explorer', href: EXPLORER_URL},
            {label: 'Uniswap v4 docs', href: 'https://docs.uniswap.org/contracts/v4/overview'},
            {label: 'Chainlink data feeds', href: 'https://docs.chain.link/data-feeds'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Farmenta. This documentation is not financial advice.`,
    },
    prism: {
      theme: farmentaPrism,
      darkTheme: farmentaPrism,
      additionalLanguages: ['solidity', 'bash', 'json'],
    },
    mermaid: {
      theme: {light: 'base', dark: 'base'},
      options: {
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        themeVariables: {
          darkMode: true,
          background: '#05080f',
          primaryColor: '#101a2b',
          primaryTextColor: '#e9eff8',
          primaryBorderColor: '#007ffd',
          secondaryColor: '#0b1220',
          secondaryTextColor: '#e9eff8',
          secondaryBorderColor: '#45576b',
          tertiaryColor: '#080d18',
          tertiaryTextColor: '#e9eff8',
          tertiaryBorderColor: '#2b3a4d',
          lineColor: '#8496b0',
          textColor: '#e9eff8',
          mainBkg: '#101a2b',
          nodeBorder: '#007ffd',
          clusterBkg: '#080d18',
          clusterBorder: '#2b3a4d',
          titleColor: '#e9eff8',
          edgeLabelBackground: '#0b1220',
          actorBkg: '#101a2b',
          actorBorder: '#007ffd',
          actorTextColor: '#e9eff8',
          actorLineColor: '#45576b',
          signalColor: '#8496b0',
          signalTextColor: '#e9eff8',
          labelBoxBkgColor: '#0b1220',
          labelBoxBorderColor: '#45576b',
          labelTextColor: '#e9eff8',
          loopTextColor: '#e9eff8',
          noteBkgColor: '#0b1220',
          noteBorderColor: '#45576b',
          noteTextColor: '#b3c2d6',
          activationBkgColor: '#0a4bb0',
          activationBorderColor: '#00b9fd',
        },
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
