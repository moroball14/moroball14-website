// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require("prism-react-renderer/themes/github");
const darkCodeTheme = require("prism-react-renderer/themes/dracula");

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "moroball14 Site",
  favicon: "img/freecorn.ico",

  // Set the production url of your site here
  url: "https://your-docusaurus-test-site.com",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "moroball14-website/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "moroball14", // Usually your GitHub org/user name.
  projectName: "moroball14-website", // Usually your repo name.
  deploymentBranch: "gh-pages",
  trailingSlash: false,

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "ja",
    locales: ["ja"],
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            "https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/",
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          readingTime: ({ content, frontMatter, defaultReadingTime }) =>
            defaultReadingTime({ content, options: { wordsPerMinute: 300 } }),
          editUrl:
            "https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/",
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: "img/freecorn.png",
      navbar: {
        title: "moroball14 Site",
        logo: {
          alt: "moroball14 Site Logo",
          src: "img/freecorn.png",
        },
        items: [
          { to: "/docs/profile", label: "Profile", position: "left" },
          { to: "/docs/jobs", label: "Jobs", position: "left" },
          { to: "/blog", label: "Blog", position: "left" },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: [
              {
                label: "Profile",
                to: "/docs/profile",
              },
              {
                label: "Jobs",
                to: "/docs/jobs",
              },
            ],
          },
          {
            title: "Account",
            items: [
              {
                label: "Twitter",
                href: "https://twitter.com/moroball14",
              },
              {
                label: "GitHub",
                href: "https://github.com/moroball14",
              },
              {
                label: "Qiita",
                href: "https://qiita.com/moroball14",
              },
              {
                label: "LinkedIn",
                href: "https://www.linkedin.com/in/daiki-morokoshi-92b27025b/",
              },
              {
                label: "note",
                href: "https://note.com/moroball14",
              },
            ],
          },
          {
            title: "More",
            items: [
              {
                label: "Blog",
                to: "/blog",
              },
              {
                label: "GitHub",
                href: "https://github.com/moroball14/moroball14-website",
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} . Built with Docusaurus.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
    }),
};

module.exports = config;
