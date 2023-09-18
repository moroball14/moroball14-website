import React from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import styles from "./styles.module.css";

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<"svg">>;
  description: JSX.Element;
  to: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: "Profile",
    Svg: require("@site/static/img/freecorn.svg").default,
    description: <>氏名、学歴、好きなこと、など</>,
    to: "/docs/profile",
  },
  {
    title: "Jobs",
    Svg: require("@site/static/img/programer.svg").default,
    description: <>スキル、職歴、など</>,
    to: "/docs/jobs",
  },
  {
    title: "(準備中)Blog",
    Svg: require("@site/static/img/blog.svg").default,
    description: <>読書メモ、技術メモ、日記、雑記、など</>,
    to: "/blog",
  },
];

function Feature({ title, Svg, description, to }: FeatureItem) {
  return (
    <div className={clsx("col col--4")}>
      <Link to={to}>
        <div className="text--center">
          <Svg className={styles.featureSvg} role="img" />
        </div>
        <div className="text--center padding-horiz--md">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </Link>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
