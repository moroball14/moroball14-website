---
slug: graphql-nextjs-nestjs-setup
title: GraphQL + Next.js + NestJS でQuery, Mutation, Subscription を実装する
authors: moroball14
tags: ["GraphQL", "Next.js", "NestJS"]
---

個人でアプリ開発していて、当初 GraphQL を使っていたが、要件を考慮すると REST API の方が良いと判断し、REST API に変更した。

とはいえ、GraphQL での環境構築はしたので、供養としてその雑なメモを残しておく。（後日ちゃんと中身の解説をする）

<!--truncate-->

## サンプルリポジトリ

backend: https://github.com/moroball14/moroball14-demo-graphql-server

frontend: https://github.com/moroball14/moroball14-demo-graphql-client

## 事前準備

まずは、NestJS でアプリケーションを一つ作成する。

```shell
$ nest new moroball14-demo-backend
$ cd moroball14-demo-backend
$ npm run start
```

NestJS で Prisma を利用できるようにする。[NestJS のドキュメント](https://docs.nestjs.com/recipes/prisma)を参考にする。

```shell
$ npm install prisma --save-dev
$ npx prisma init
```

`schema.prisma` と `.env` が作成される。 `schema.prisma` に以下を追記する。

```schema.prisma
model User {
  id    Int     @default(autoincrement()) @id
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id        Int      @default(autoincrement()) @id
  title     String
  content   String?
  published Boolean? @default(false)
  author    User?    @relation(fields: [authorId], references: [id])
  authorId  Int?
}
```

そして

```shell
$ npx prisma migrate dev --name init
```

を実行する。が、現段階では、以下のエラーが出る。

```shell
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "mydb", schema "public" at "localhost:5432"

Error: P1001: Can't reach database server at `localhost`:`5432`

Please make sure your database server is running at `localhost`:`5432`.
```

DB が存在していないため、エラーが出ている。そこで、Docker で DB を起動できるようにする。

まずは必要なファイルをすべて生成する。

```shell
$ touch Dockerfile
$ touch docker-compose.yaml
$ mkdir scripts
$ touch scripts/docker-entrypoint.sh
```

次にそれぞれのファイルに以下を記述する。

`Dockerfile`

```Dockerfile
FROM node:18

# 作業ディレクトリを指定
WORKDIR /usr/src/app

# package.jsonとpackage-lock.jsonを/usr/src/appにコピー
COPY package*.json ./

# npm installを実行
RUN npm install

# ファイルを/usr/src/appにコピー
COPY . .

# コンテナ起動時に実行するスクリプトを指定
COPY scripts/docker-entrypoint.sh /usr/src/app/scripts/docker-entrypoint.sh

# 実行権限を付与
RUN chmod +x /usr/src/app/scripts/docker-entrypoint.sh

ENTRYPOINT ["/usr/src/app/scripts/docker-entrypoint.sh"]
```

`docker-compose.yaml`

```yaml
version: "3.8"

services:
  nestjs_app:
    container_name: nestjs_app
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ./:/usr/src/app
    ports:
      - "3000:3000"
      - "5555:5555" # Prisma Studio用に追加
    environment:
      - DATABASE_URL=postgres://postgres:password@postgres:5432/nestjs?schema=public # Prisma用にDATABASE_URL変数を追加
    depends_on:
      - postgres
  postgres:
    container_name: postgres
    image: postgres:15
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=nestjs
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
```

`scripts/docker-entrypoint.sh`

```scripts/docker-entrypoint.sh
#!/bin/bash

npm run start
```

その後、以下のコマンドを実行する。

```shell
$ chmod +x ./scripts/docker-entrypoint.sh
```

これをしなければ、コンテナ起動時に permission エラーが出てしまう。

その後、以下のコマンドを実行すると、postgres のコンテナが起動し、NestJS アプリケーションが起動する。

```shell
$ docker compose up --build
[8:39:18 AM] Starting compilation in watch mode...
nestjs_app  |
nestjs_app  | [8:39:34 AM] Found 0 errors. Watching for file changes.
nestjs_app  |
nestjs_app  | [Nest] 31  - 10/22/2023, 8:39:41 AM     LOG [NestFactory] Starting Nest application...
nestjs_app  | [Nest] 31  - 10/22/2023, 8:39:41 AM     LOG [InstanceLoader] AppModule dependencies initialized +9ms
nestjs_app  | [Nest] 31  - 10/22/2023, 8:39:41 AM     LOG [RoutesResolver] AppController {/}: +233ms
nestjs_app  | [Nest] 31  - 10/22/2023, 8:39:41 AM     LOG [RouterExplorer] Mapped {/, GET} route +1ms
nestjs_app  | [Nest] 31  - 10/22/2023, 8:39:41 AM     LOG [NestApplication] Nest application successfully started +1ms

```

```shell
$ docker ps
CONTAINER ID   IMAGE                                COMMAND                  CREATED         STATUS         PORTS                                            NAMES
c3c8676b6168   moroball14-demo-backend-nestjs_app   "/usr/src/app/script…"   2 minutes ago   Up 2 minutes   0.0.0.0:3000->3000/tcp, 0.0.0.0:5555->5555/tcp   nestjs_app
7375ff9adadb   postgres:15                          "docker-entrypoint.s…"   2 minutes ago   Up 2 minutes   0.0.0.0:5432->5432/tcp                           postgres
```

で、postgres のコンテナが起動しているので、再度マイグレーションファイルを作成してみる。
postgres のコンテナと接続できるのは、NestJS のコンテナなので、そこに入る。

```shell
$ docker compose exec nestjs_app bash
root@c3c8676b6168:/usr/src/app# npx prisma migrate dev --name init
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "nestjs", schema "public" at "postgres:5432"

Applying migration `20231022084708_init`

The following migration(s) have been created and applied from new schema changes:

migrations/
  └─ 20231022084708_init/
    └─ migration.sql

Your database is now in sync with your schema.

Running generate... (Use --skip-generate to skip the generators)

added 2 packages, and audited 675 packages in 6s

99 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

✔ Generated Prisma Client (v5.4.2) to ./node_modules/@prisma/client in 921ms
```

成功した。

```shell
root@c3c8676b6168:/usr/src/app# npx prisma studio
```

を実行すると、localhost:5555 で Prisma Studio が起動するのでそれを確認する。

あとは、NestJS で Prisma を扱えるようにするだけ。

```shell
$ npm install @prisma/client
$ touch src/prisma.service.ts
```

`src/prisma.service.ts`

```ts
import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

これ以降は、GraphQL の操作によって Prisma を経由した DB 操作ができるようにする。後続の 「GraphQL サーバーを構築する」 で実装する。

ここまででバックエンドの準備は終了。

次は、フロントエンド。

Next.js アプリケーションを作成する。

```shell
$ npx create-next-app@latest
```

このコマンドを実行して出てくるいくつかの質問に答えると、アプリケーションが作成できる。基本的にすべて yes。

これでようやく準備が完了です。

## GraphQL サーバーを構築する

バックエンドのリポジトリに移動する。
まずは、関連パッケージのインストール。（もしコンテナを停止していなければ、 `docker compose down` を実行する）

```shell
$ npm i @nestjs/graphql @nestjs/apollo @apollo/server graphql
```

`app.module.ts` に変更を加える。

```shell
git diff src/app.module.ts
diff --git a/src/app.module.ts b/src/app.module.ts
index 8662803..5fdd1a3 100644
--- a/src/app.module.ts
+++ b/src/app.module.ts
@@ -1,9 +1,15 @@
 import { Module } from '@nestjs/common';
 import { AppController } from './app.controller';
 import { AppService } from './app.service';
+import { GraphQLModule } from '@nestjs/graphql';
+import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

 @Module({
-  imports: [],
+  imports: [
+    GraphQLModule.forRoot<ApolloDriverConfig>({
+      driver: ApolloDriver,
+    }),
+  ],
   controllers: [AppController],
   providers: [AppService],
 })
```

次に、 `post.model.ts` と `user.model.ts` を作成する。

`src/models/post.model.ts`

```ts
import { Field, Int, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class Post {
  @Field((type) => Int)
  id: number;

  @Field()
  title: string;

  @Field({ nullable: true })
  content?: string;

  @Field({ nullable: true })
  published?: boolean;
}
```

`src/models/user.model.ts`

```ts
import { Field, Int, ObjectType } from "@nestjs/graphql";
import { Post } from "./post.model";

@ObjectType()
export class User {
  @Field((type) => Int)
  id: number;

  @Field()
  email: string;

  @Field({ nullable: true })
  name?: string;

  @Field((type) => [Post], { nullable: true })
  posts: Post[];
}
```

ここまで準備ができたら、 Resolver を作成する。

`src/users/users.resolver.ts`

```ts
import {
  Args,
  Int,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from "@nestjs/graphql";
import { User } from "src/models/user.model";
import { PostService } from "src/post.service";
import { UserService } from "src/user.service";

@Resolver((of) => User)
export class UsersResolver {
  constructor(
    private userService: UserService,
    private postService: PostService
  ) {}

  @Query((returns) => User)
  async user(@Args("id", { type: () => Int }) id: number) {
    return this.userService.findOneById(id);
  }

  @ResolveField()
  async posts(@Parent() user: User) {
    const { id } = user;
    return this.postService.findAllByAuthorId({ authorId: id });
  }
}
```

ここで必要な `user.service.ts` と `post.service.ts` を作成する。

`src/post.service.ts`

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { Post } from "@prisma/client";

@Injectable()
export class PostService {
  constructor(private prisma: PrismaService) {}
  async findAllByAuthorId({ authorId }: { authorId: number }): Promise<Post[]> {
    return this.prisma.post.findMany({
      where: {
        authorId,
      },
    });
  }
}
```

`src/user.service.ts`

```ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { User } from "@prisma/client";

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async findOneById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: {
        id,
      },
    });
  }
}
```

これで、GraphQL サーバーの準備ができたので、 `docker compose up --build` で起動してみると以下のエラーが。

```shell
nestjs_app  |   GraphQLError: Query root type must be provided.
nestjs_app  |       at SchemaValidationContext.reportError (/usr/src/app/node_modules/graphql/type/validate.js:73:7)
nestjs_app  |       at validateRootTypes (/usr/src/app/node_modules/graphql/type/validate.js:89:13)
nestjs_app  |       at validateSchema (/usr/src/app/node_modules/graphql/type/validate.js:41:3)
nestjs_app  |       at graphqlImpl (/usr/src/app/node_modules/graphql/graphql.js:60:63)
nestjs_app  |       at /usr/src/app/node_modules/graphql/graphql.js:23:43
nestjs_app  |       at new Promise (<anonymous>)
nestjs_app  |       at graphql (/usr/src/app/node_modules/graphql/graphql.js:23:10)
nestjs_app  |       at GraphQLSchemaFactory.create (/usr/src/app/node_modules/@nestjs/graphql/dist/schema-builder/graphql-schema.factory.js:50:65)
nestjs_app  |       at GraphQLSchemaBuilder.generateSchema (/usr/src/app/node_modules/@nestjs/graphql/dist/graphql-schema.builder.js:35:52)
nestjs_app  |       at GraphQLSchemaBuilder.build (/usr/src/app/node_modules/@nestjs/graphql/dist/graphql-schema.builder.js:22:31) {
nestjs_app  |     path: undefined,
nestjs_app  |     locations: undefined,
nestjs_app  |     extensions: [Object: null prototype] {}
nestjs_app  |   }
nestjs_app  | ]
```

よくよく考えたら、Prisma の Module はまだ NestJS で利用できるようにしていないので、`src/prisma.module.ts` を作成する。

```ts
import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

そして、各種サービスや Resolver を利用できるようにする。

`src/app.module.ts`

```ts
import { Module } from "@nestjs/common";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { join } from "path";
import { PrismaModule } from "./prisma.module";
import { PostService } from "./post.service";
import { UserService } from "./user.service";
import { UsersResolver } from "./users/users.resolver";

@Module({
  imports: [
    PrismaModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), "src/schema.gql"),
    }),
  ],
  controllers: [],
  providers: [PostService, UserService, UsersResolver],
})
export class AppModule {}
```

すると、GraphQL のスキーマが生成される。

`schema.gql`

```gql
# ------------------------------------------------------
# THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)
# ------------------------------------------------------

type Post {
  id: Int!
  title: String!
  content: String
  published: Boolean
}

type User {
  id: Int!
  email: String!
  name: String
  posts: [Post!]
}

type Query {
  user(id: Int!): User!
}
```

すると、エラーが解消される。

```shell
docker compose up --build
[9:44:22 AM] File change detected. Starting incremental compilation...
nestjs_app  |
nestjs_app  | [9:44:23 AM] Found 0 errors. Watching for file changes.
nestjs_app  |
nestjs_app  | [Nest] 110  - 10/22/2023, 9:44:30 AM     LOG [NestFactory] Starting Nest application...
nestjs_app  | [Nest] 110  - 10/22/2023, 9:44:30 AM     LOG [InstanceLoader] PrismaModule dependencies initialized +29ms
nestjs_app  | [Nest] 110  - 10/22/2023, 9:44:30 AM     LOG [InstanceLoader] AppModule dependencies initialized +1ms
nestjs_app  | [Nest] 110  - 10/22/2023, 9:44:30 AM     LOG [InstanceLoader] GraphQLSchemaBuilderModule dependencies initialized +0ms
nestjs_app  | [Nest] 110  - 10/22/2023, 9:44:30 AM     LOG [InstanceLoader] GraphQLModule dependencies initialized +1ms
nestjs_app  | [Nest] 110  - 10/22/2023, 9:44:30 AM     LOG [GraphQLModule] Mapped {/graphql, POST} route +555ms
nestjs_app  | [Nest] 110  - 10/22/2023, 9:44:30 AM     LOG [NestApplication] Nest application successfully started +1ms
```

`http://localhost:3000/graphql` へのアクセスも可能になっているはずだ。

## Mutation を実装する

```shell
diff --git a/src/users/users.resolver.ts b/src/users/users.resolver.ts
index a22bba3..a3202d8 100644
--- a/src/users/users.resolver.ts
+++ b/src/users/users.resolver.ts
@@ -1,6 +1,7 @@
 import {
   Args,
   Int,
+  Mutation,
   Parent,
   Query,
   ResolveField,
@@ -22,6 +23,14 @@ export class UsersResolver {
     return this.userService.findOneById(id);
   }

+  @Mutation((returns) => User)
+  async createUser(@Args('email') email: string, @Args('name') name: string) {
+    return this.userService.createUser({
+      email,
+      name,
+    });
+  }
+
   @ResolveField()
   async posts(@Parent() user: User) {
     const { id } = user;
```

`user.service.ts` に `createUser` を追加する。

```typescript
async createUser(data: Prisma.UserCreateInput): Promise<User> {
  return this.prisma.user.create({
    data,
  });
}
```

これができたら、 `docker compose up --build` で起動して、 `http://localhost:3000/graphql` で mutation を実行してみる。

```graphql
mutation CreateUser($email: String!, $name: String!) {
  createUser(email: $email, name: $name) {
    email
    name
  }
}
```

![graphql-mutation](./grapql-mutation.png)

Prisma Studio を起動すると、先ほどのデータが追加されている。

![prisma-studio-after-create-user](./prisma-studio-after-create-user.png)

## Query を実装する

とは言っても、先ほどのセットアップ時に実装したので動作確認をする。

まずは、posts のデータを追加する。

その実装は以下。

`src/posts/posts.resolver.ts`

```ts
import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Post } from "src/models/post.model";
import { PostService } from "src/post.service";

@Resolver((of) => Post)
export class PostsResolver {
  constructor(private postService: PostService) {}

  @Mutation((returns) => Post)
  async createDraft(
    @Args("title") title: string,
    @Args("content") content: string,
    @Args("authorId") authorId: number
  ) {
    return this.postService.createPost({
      title,
      content,
      published: false,
      author: {
        connect: { id: authorId },
      },
    });
  }
}
```

`app.module.ts` に追加したのちに、以下の Mutation を実行する。

```graphql
mutation CreateDraft($title: String!, $content: String!, $authorId: Float!) {
  createDraft(title: $title, content: $content, authorId: $authorId) {
    id
    title
    content
  }
}
```

```graphql
query User($id: Int!) {
  user(id: $id) {
    id
    email
    name
    posts {
      id
      title
      content
      published
    }
  }
}
```

すると、以下のようにデータが取得できる。

![graphql-query-with-posts](./graphql-query-with-posts.png)

posts が不要であれば、以下のようにクエリを書くことも可能。

```graphql
query User($id: Int!) {
  user(id: $id) {
    id
    email
    name
  }
}
```

## GraphQL クライアントを構築する

以下を参考に構築していく。

https://www.apollographql.com/blog/apollo-client/next-js/how-to-use-apollo-client-with-next-js-13/

https://www.apollographql.com/blog/apollo-client/next-js/next-js-getting-started/

必要なパッケージをインストールする。

```shell
$ npm install @apollo/client@rc @apollo/experimental-nextjs-app-support graphql
```

どのコンポーネントでも GraphQL を利用できるように、Provider を作成し、適用する。

`src/app/lib/apolloProvider.tsx`

```tsx
"use client";
import React from "react";
import { ApolloLink, HttpLink } from "@apollo/client";
import {
  ApolloNextAppProvider,
  NextSSRApolloClient,
  NextSSRInMemoryCache,
  SSRMultipartLink,
} from "@apollo/experimental-nextjs-app-support/ssr";

function makeClient() {
  const httpLink = new HttpLink({
    uri: "http://localhost:3000/graphql", // とりあえず開発環境用
  });

  return new NextSSRApolloClient({
    cache: new NextSSRInMemoryCache(),
    link:
      typeof window === "undefined"
        ? ApolloLink.from([
            new SSRMultipartLink({
              stripDefer: true,
            }),
            httpLink,
          ])
        : httpLink,
  });
}

export function ApolloWrapper({ children }: React.PropsWithChildren) {
  return (
    <ApolloNextAppProvider makeClient={makeClient}>
      {children}
    </ApolloNextAppProvider>
  );
}
```

`src/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ApolloWrapper } from "./lib/apolloProvider"; // 追加

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ApolloWrapper>{children}</ApolloWrapper>
      </body>
    </html>
  );
}
```

これでセットアップが完了。実際に画面から Query と Mutation を実行する。

`src/app/graphql-page/page.tsx`

```tsx
"use client";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useCallback, useState } from "react";

const CREATE_USER_MUTATION = gql`
  mutation CreateUser($email: String!, $name: String!) {
    createUser(email: $email, name: $name) {
      email
      name
    }
  }
`;

const GET_USERS_QUERY = gql`
  query GetUsers($id: Int!) {
    user(id: $id) {
      email
      name
    }
  }
`;

export default function Page() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [id, setId] = useState(1);
  const [createUser] = useMutation(CREATE_USER_MUTATION);

  const { loading, error, data } = useQuery(GET_USERS_QUERY, {
    variables: { id },
  });

  const handleCreateUser = useCallback(async () => {
    try {
      await createUser({
        variables: {
          email,
          name,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }, [createUser, email, name]);

  return (
    <div>
      <br />
      id: <input
        type="number"
        defaultValue={1}
        value={id}
        onChange={(e) => setId(Number(e.target.value))}
      /> is {loading
        ? "loading..."
        : error
        ? error.message
        : JSON.stringify(data)}
      <br />
      {/* inputの前に項目名つける */}
      email:{" "}
      <input
        type="text"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <br />
      name:{" "}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <br />
      <button onClick={handleCreateUser}>Create User</button>
    </div>
  );
}
```

これでリクエストを飛ばすと以下のエラーが出る。

```shell
Access to fetch at 'http://localhost:3000/graphql' from origin 'http://localhost:3001' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource. If an opaque response serves your needs, set the request's mode to 'no-cors' to fetch the resource with CORS disabled.
```

そのため、バックエンド側で CORS を許可する。

```shell
diff --git a/src/main.ts b/src/main.ts
index 13cad38..3a3d162 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -3,6 +3,10 @@ import { AppModule } from './app.module';

 async function bootstrap() {
   const app = await NestFactory.create(AppModule);
+  // localhost:3001からのアクセスを許可する
+  app.enableCors({
+    origin: 'http://localhost:3001',
+  });
   await app.listen(3000);
 }
```

## Subscription を実装する

まずは GraphQL サーバーの準備をする。

```shell
$ npm install graphql-subscriptions subscriptions-transport-ws
```

`app.module.ts` に以下の変更を加える。

```shell
diff --git a/src/app.module.ts b/src/app.module.ts
index 878f09a..441a124 100644
--- a/src/app.module.ts
+++ b/src/app.module.ts
@@ -14,6 +14,11 @@ import { PostsResolver } from './posts/posts.resolver';
     GraphQLModule.forRoot<ApolloDriverConfig>({
       driver: ApolloDriver,
       autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
+      installSubscriptionHandlers: true,
+      subscriptions: {
+        'graphql-ws': true,
+        'subscriptions-transport-ws': true,
+      },
     }),
   ],
   controllers: [],
```

ここまでで設定は終了したので、user が追加されたときに Publish するように変更する。

```shell
diff --git a/src/users/users.resolver.ts b/src/users/users.resolver.ts
index a3202d8..51fd561 100644
--- a/src/users/users.resolver.ts
+++ b/src/users/users.resolver.ts
@@ -6,11 +6,15 @@ import {
   Query,
   ResolveField,
   Resolver,
+  Subscription,
 } from '@nestjs/graphql';
+import { PubSub } from 'graphql-subscriptions';
 import { User } from 'src/models/user.model';
 import { PostService } from 'src/post.service';
 import { UserService } from 'src/user.service';

+const pubsub = new PubSub();
+
 @Resolver((of) => User)
 export class UsersResolver {
   constructor(
@@ -25,6 +29,7 @@ export class UsersResolver {

   @Mutation((returns) => User)
   async createUser(@Args('email') email: string, @Args('name') name: string) {
+    pubsub.publish('userAdded', { userAdded: { email, name } });
     return this.userService.createUser({
       email,
       name,
@@ -36,4 +41,9 @@ export class UsersResolver {
     const { id } = user;
     return this.postService.findAllByAuthorId({ authorId: id });
   }
+
+  @Subscription((returns) => User)
+  userAdded() {
+    return pubsub.asyncIterator('userAdded');
+  }
 }
```

次にクライアントの実装を行う。以下を参考にする

https://www.apollographql.com/docs/react/data/subscriptions

```shell
$ npm i graphql-ws
```

```shell
diff --git a/src/app/lib/apolloProvider.tsx b/src/app/lib/apolloProvider.tsx
index 61d3423..fb22d92 100644
--- a/src/app/lib/apolloProvider.tsx
+++ b/src/app/lib/apolloProvider.tsx
@@ -1,12 +1,15 @@
 "use client";
 import React from "react";
-import { ApolloLink, HttpLink } from "@apollo/client";
+import { ApolloLink, HttpLink, split } from "@apollo/client";
 import {
   ApolloNextAppProvider,
   NextSSRApolloClient,
   NextSSRInMemoryCache,
   SSRMultipartLink,
 } from "@apollo/experimental-nextjs-app-support/ssr";
+import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
+import { createClient } from "graphql-ws";
+import { getMainDefinition } from "@apollo/client/utilities";

 function makeClient() {
   const httpLink = new HttpLink({
@@ -14,6 +17,24 @@ function makeClient() {
     uri: "http://localhost:3000/graphql",
   });

+  const wsLink = new GraphQLWsLink(
+    createClient({
+      url: "ws://localhost:3000/graphql",
+    })
+  );
+
+  const splitLink = split(
+    ({ query }) => {
+      const definition = getMainDefinition(query);
+      return (
+        definition.kind === "OperationDefinition" &&
+        definition.operation === "subscription"
+      );
+    },
+    wsLink,
+    httpLink
+  );
+
   return new NextSSRApolloClient({
     cache: new NextSSRInMemoryCache(),
     link:
@@ -24,7 +45,7 @@ function makeClient() {
             }),
             httpLink,
           ])
-        : httpLink,
+        : splitLink,
   });
 }
```

残りは実際に Subscription の動作を確認したい画面のコンポーネントを修正する。

```shell
diff --git a/src/app/graphql-page/page.tsx b/src/app/graphql-page/page.tsx
index 3c5aed3..60401d9 100644
--- a/src/app/graphql-page/page.tsx
+++ b/src/app/graphql-page/page.tsx
@@ -1,5 +1,5 @@
 "use client";
-import { gql, useMutation, useQuery } from "@apollo/client";
+import { gql, useMutation, useQuery, useSubscription } from "@apollo/client";
 import { useCallback, useState } from "react";

 const CREATE_USER_MUTATION = gql`
@@ -20,11 +20,22 @@ const GET_USERS_QUERY = gql`
   }
 `;

+const USER_ADDED = gql`
+  subscription {
+    userAdded {
+      email
+      name
+    }
+  }
+`;
+
 export default function Page() {
   const [email, setEmail] = useState("");
   const [name, setName] = useState("");
   const [id, setId] = useState(1);
   const [createUser] = useMutation(CREATE_USER_MUTATION);
+  const { data: eventData, loading: eventLoading } =
+    useSubscription(USER_ADDED);

   const { loading, error, data } = useQuery(GET_USERS_QUERY, {
     variables: { id },
@@ -71,6 +82,14 @@ export default function Page() {
       />
       <br />
       <button onClick={handleCreateUser}>Create User</button>
+      <br />
+      <br />
+      {eventData ? (
+        <p>
+          Event occurred: {eventData.userAdded.email}, Name:{" "}
+          {eventData.userAdded.name}
+        </p>
+      ) : null}
     </div>
   );
 }
```

これで、画面からユーザーを追加すると、Subscription が動作して、画面に追加されたユーザーがリアルタイムで表示される。

## 参考

- https://docs.nestjs.com/graphql/resolvers
- https://www.apollographql.com/blog/apollo-client/next-js/how-to-use-apollo-client-with-next-js-13/
- https://docs.nestjs.com/graphql/subscriptions
- https://www.apollographql.com/docs/react/data/subscriptions/
