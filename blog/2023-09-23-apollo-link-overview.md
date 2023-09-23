---
slug: apollo-link-overview
title: Apollo Linkについての概要を調べる
authors: moroball14
tags: []
---

個人で開発中のアプリで Apollo を使っていて、Link という概念について深ぼれていないなと思い、調べてみる。

<!--truncate-->

ドキュメントは以下 ↓

https://www.apollographql.com/docs/react/api/link/introduction/

> The Apollo Link library helps you customize the flow of data between Apollo Client and your GraphQL server. You can define your client's network behavior as a chain of link objects that execute in a sequence

とある通り、Apollo Client と GraphQL サーバー間のデータの流れをカスタマイズできるらしい。
シーケンス、つまり順序通り実行する。カスタマイズした処理を。データの流れをつなぐから`Link`という表現になったのかな？

> Each link should represent either a self-contained modification to a GraphQL operation or a side effect (such as logging).

とあるように、ロギングのような副作用が発生する処理を挟んだり、あとは HTTP ヘッダーに認証情報を追加したりするような、変更や副作用を加える目的で、Link を使う理解であっているかな？

最初にこの Link が必要になったのは HttpLink だったけど、正直この時はそれほど意識していなかった。意識し始めたのはエラーのデバッグ。
デフォルトだと、 `ApolloError: Response not successful: Received status code 400` しか出なくて、何が起きているのか把握ができなかった。しかし、

```ts
"use client";
import React from "react";
import { ApolloLink, HttpLink, split } from "@apollo/client";
import {
  NextSSRApolloClient,
  NextSSRInMemoryCache,
  SSRMultipartLink,
} from "@apollo/experimental-nextjs-app-support/ssr";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { getMainDefinition } from "@apollo/client/utilities";
import { onError } from "@apollo/client/link/error";

function makeClient() {
  const httpLink = new HttpLink({
    uri: "http://localhost:3000/graphql", // localhostでGraphQLサーバーを立てている前提
  });

  const wsLink = new GraphQLWsLink(
    createClient({
      url: "ws://localhost:3000/graphql",
    })
  );

  // Log any GraphQL errors or network error that occurred
  const errorLink = onError(({ graphQLErrors, networkError }) => {
    if (graphQLErrors)
      graphQLErrors.forEach(({ message, locations, path }) =>
        console.log(
          `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`
        )
      );
    if (networkError) console.log(`[Network error]: ${networkError}`);
  });

  const splitLink = split(
    ({ query }) => {
      const definition = getMainDefinition(query);
      return (
        definition.kind === "OperationDefinition" &&
        definition.operation === "subscription"
      );
    },
    errorLink.concat(wsLink),
    errorLink.concat(httpLink)
  );

  return new NextSSRApolloClient({
    cache: new NextSSRInMemoryCache(),
    link:
      typeof window === "undefined"
        ? ApolloLink.from([
            new SSRMultipartLink({
              stripDefer: true,
            }),
            errorLink,
            httpLink,
          ])
        : splitLink,
  });
}
```

とすると、エラー文の詳細が確認でき、コードの修正ができるようになった。

その他にもカスタムリンクと呼ばれる機能もあり、自分で自由にネットワーク操作を拡張できる。
たとえば

```ts
import { ApolloLink } from "@apollo/client";

const timeStartLink = new ApolloLink((operation, forward) => {
  operation.setContext({ start: new Date() });
  return forward(operation);
});
```

このようにしたら、GraphQL の操作のコンテキストに新しい start というプロパティが追加できる。
forward を呼び忘れそうー。ESLint で防げそうな感じはする。

概要は少しわかった気がするので、またわからない点が出てきたら、このブログに追記する。
