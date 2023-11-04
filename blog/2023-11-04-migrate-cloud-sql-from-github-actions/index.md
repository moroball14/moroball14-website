---
slug: migrate-cloud-sql-from-github-actions
title: GitHub Actionsから Cloud SQL へのマイグレーションを行うには
authors: moroball14
tags: ["Google Cloud", "Cloud SQL", "GitHub Actions", "Prisma"]
---

GitHub Actions から Cloud SQL で構築しているデータベースに対してマイグレーションを行いたい。

<!--truncate-->

どうやるのかわからないので、とりあえず今知っている情報だけで仮説を立ててみると、

- マイグレーションの仕組みを用意する
  - これは Prisma が提供している
- GitHub Actions から Google Cloud のサービスを扱うための認証情報を取得
  - これは Workload Identity 連携を使う
- マイグレーションを実行する

大体こんな感じだろうと予想する。

参考にできそうな記事があった。

https://blog.flinters.co.jp/entry/2023/09/18/120000

途中の terraform が出てきたあたりで、ウッとなった。（terraform 触ったことない）

今回は terraform は触らずに Google Cloud のコンソール画面から設定を行うかー。

上記の記事で出てきた OIDC について、ちょっと理解が浅いので、とりあえず記事を一つ読んでみる。

ものすごいタイトルの記事を見つけた。「[一番分かりやすい OpenID Connect の説明](https://qiita.com/TakahikoKawasaki/items/498ca08bbfcc341691fe)」。どうやら資金調達のための投資家めぐりの際に、OpenID Connect の説明をしてまわっていたらしい。

ID トークンとプロパイダーの関係性を、会社が発行した名刺と会社の関係性に例えているのがわかりやすい。会社に公開鍵ください、っていっているシーン急にエンジニア向けに説明がよっているけど、会社も普通にハイどうぞって渡しているの面白い。

GitHub Actions との Workload Identity 連携を構成するために Google のドキュメントを読み直すと、

> GitHub Actions ワークフローでは、GitHub OIDC トークンを取得して、ワークフローとそのリポジトリを一意に識別できます
> ref: https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines?hl=ja

とある。GitHub の OIDC トークンを Google 側に持っておくことで、GitHub Actions から Google Cloud のサービスに対する要求が行えるのか。でそれを持っておくための Workload Identity のプールとプロパイダが必要になる、と理解した。

あと、考慮もれていたのが、Cloud SQL Auth Proxy だった。

https://cloud.google.com/sql/docs/postgres/sql-proxy?hl=ja

Cloud SQL Auth Proxy は、Cloud SQL のインスタンスに対して安全にアクセスするための Cloud SQL コネクタで

- 安全な接続
- 接続認可の簡素化
- IAM データベース認証

を提供してくれる。Cloud SQL Auth Proxy を使う要件としては

- Cloud SQL Admin API が有効になっていること
- Cloud SQL Auth Proxy に Google Cloud 認証情報を指定すること
- Cloud SQL Auth Proxy に有効なデータベースユーザーアカウントとパスワードを指定すること
- Cloud SQL インスタンスでパブリック IPv4 アドレスが指定されているか、プライベート IP を使用するように構成されていること

となっている。

接続方法は下記。

https://cloud.google.com/sql/docs/postgres/connect-auth-proxy?hl=ja

ダウンロードして起動するってことだから、GitHub Actions の Market place にあるのかなと調べてみたらあった。

https://github.com/marketplace/actions/google-cloud-sql-proxy

さっきの記事は curl 使ってダウンロードしてから起動していたので、もし GitHub Actions がうまく動作しなかったらこの curl という選択肢も残しておく。

ということで、やることをまとめると

- 1. Workload Identity 連携を構成する
- 2. Cloud SQL インスタンスを作成する
- 3. Cloud SQL インスタンスに接続する Cloud SQL Auth Proxy を構成する
- 4. GitHub Actions から Cloud SQL Auth Proxy を経由して Cloud SQL インスタンスに接続してマイグレーションを実行する

で、1~3 は基本的には Google Cloud のコンソール画面から設定を行う。4 が GitHub Actions での設定になる。

あー、あと Prisma Migrate の方法って dev と prod で違うかな？ちょっと確認する。

https://www.prisma.io/docs/concepts/components/prisma-migrate

https://www.prisma.io/docs/concepts/components/prisma-migrate/mental-model

ローカル環境では、 `prisma migrate dev` か `prisma db push` を使ってデータベーススキーマと同期（マイグレーション）する。

本番環境では、 `prisma migrate deploy` を使ってデータベーススキーマと同期する。

図がわかりやすいので、ここにも載せておく。

![prisma-migrate](https://www.prisma.io/docs/static/df6806090a7cfecaddbd6372693fb064/663f3/prisma-migrate-lifecycle.png)

理想は環境ごとに一つのデータベース。これは用意する。

`prisma migrate dev` は移行ファイルを自動で生成してデータベースに適用する。これは

- schema.prisma
- migrations history
- migrations table
- database schema

から判断するらしい。 `--create-only` フラグを使って移行をカスタマイズすることもできる。そういった時は SQL ファイルを直接いじる感じかな？

あと、 `prisma db push` は Prisma の schema とデータベースのスキーマを揃えて、モデルの型定義ファイルは生成しないっぽい。これは気をつけて使う必要ありそうだし、必要な場面が今のところないので、今回は使わない。

`prisma migrate deploy` は、移行ファイルは生成せずに保留中の移行を適用してくれるので CI/CD パイプラインで実行するイメージ。

## 1. Workload Identity 連携を構成する

以下に沿って設定を行う。

https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines?hl=ja

「Workload Identity 連携を構成する」は誘導されている通りに行えば良い。プロジェクトを選択し、API を有効にするだけだった。この章にある「属性のマッピングと条件を定義する」は、「Workload Identity のプールとプロバイダを作成する」のプロバイダ構成時に必要なので、気にせず進む。ただ一点だけ悩むことがあり、

> Workload Identity プールとプロバイダの管理に専用のプロジェクトを使用することをおすすめします。

と書いてあった。今回は気にせず進んじゃうが、商用で利用するのであれば、この Workload Identity プールとプロバイダの管理に専用のプロジェクトを作成した方が良いはず。

「Workload Identity のプールとプロバイダを作成する」に関しても誘導されている通りに手順をこなせば良い。先ほどの「属性の魔ピングと条件を定義する」に関しても GitHub Actions においては、 `google.subject=assertion.sub` を指定すれば良い。実際にはデフォルトで google.subject が設定されている項目が存在するので、対応する入力欄に `assertion.sub` を入力すれば良いだけで、迷うこともなかった。

「デプロイパイプラインを認証する」も慣れていると、それほど迷わなかった。

- デプロイパイプライン用のサービスアカウントを作成する
- デプロイパイプラインによるサービスアカウントの権限借用を許可する
- デプロイパイプラインを構成する

大体がドキュメント通りに進めれば完了する。

## 2. Cloud SQL インスタンスを作成する

まずはこれを参考にする。

https://cloud.google.com/sql/docs/postgres/connect-instance-auth-proxy?hl=ja

インスタンスを作成する。マイグレーションができるのを確認したいだけなので、

- ゾーンの可用性はシングルゾーン
- マシンは共有コア、メモリも最小
- ストレージ容量も最小で自動増量はオフ

は設定しておく。この段階でこのインスタンスに接続するためのユーザー(postgres)のパスワードを設定する箇所が存在するので、設定しておく。

次に DATABASE_URL を生成する。

`postgresql://username:password@127.0.0.1:5432/db-name?schema=public`

username の箇所は Cloud SQL のユーザーメニューから。デフォルトで用意されている `postgres` を使う。
password は作成時に設定した文字列を使う。

db-name は作成したいデータベース名。

host と port は多分これ。

## 3. Cloud SQL インスタンスに接続する Cloud SQL Auth Proxy を構成する

Workload Identity 連携が完了したのちに、行う。

```yaml
- id: "auth"
  name: "Authenticate to Google Cloud"
  uses: "google-github-actions/auth@v1"
  with:
    create_credentials_file: true
    workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
    service_account: ${{ secrets.WORKLOAD_IDENTITY_SA }}
```

`workload_identity_provider` と `service_account` は GitHub の Secrets に設定しておく。

workload_identity_provider は値の設定に注意が必要。
project id ではなく project 番号を指定する。

ローカルでの確認方法は以下を参考にする。

https://cloud.google.com/sql/docs/mysql/connect-auth-proxy?hl=ja

```shell
$ curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.6.1/cloud-sql-proxy.darwin.arm64
$ chmod +x cloud-sql-proxy
$ ./cloud-sql-proxy instancename
```

`instancename` に関しては、Cloud SQL のインスタンス一覧画面から特定のインスタンスを選択後に出てくる「このインスタンスとの接続 > 接続名」がそれにあたる。

これを実行した後に、`schema.prisma`に記載している `DATABASE_URL` を本番のインスタンスに変更して、`prisma migrate deploy` を実行して、実行できるかを確認する。

実行した後は、一旦データベースを削除して、CI/CD パイプラインで実行できるようにする。

## 4. GitHub Actions から Cloud SQL Auth Proxy を経由して Cloud SQL インスタンスに接続してマイグレーションを実行する

全体の yaml ファイルは以下。

```yaml
name: DB Migration

on:
  push:
    branches:
      - main

env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}}

jobs:
  migration:
    runs-on: ubuntu-latest
    permissions:
      contents: "read"
      id-token: "write"

    steps:
      - uses: "actions/checkout@v4"
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: "npm"
      - run: npm ci
      - id: "auth"
        name: "Authenticate to Google Cloud"
        uses: "google-github-actions/auth@v1"
        with:
          create_credentials_file: true
          workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.WORKLOAD_IDENTITY_SA }}
      - name: Start Cloud SQL Proxy
        run: |
          curl "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.6.1/cloud-sql-proxy.linux.amd64" -o cloud-sql-proxy
          chmod +x cloud-sql-proxy
          ./cloud-sql-proxy \
            --credentials-file ${{ env.GOOGLE_APPLICATION_CREDENTIALS }} ${{ secrets.POSTGRES_INSTANCE }} &
      - name: Run Prisma migration
        run: |
          npx prisma migrate deploy
```

この段階でいくつかのエラーが出たので、それらの対応を行う。まず初めに

```shell
oauth2/google: status code 400: {"error":"invalid_target","error_description":"The target service indicated by the \"audience\" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn't exist."}
```

が出ていた。pool と provider は作成できていたが、その指定方法がよくなかった。project 番号 を渡さなければいけないところを、project id を渡していた。

で、それを直すと、今度はこんなエラーが。

```shell
Error 403: Cloud SQL Admin API has not been used in project XXXXXXXXXXX before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/sqladmin.googleapis.com/overview?project=XXXXXXXXXXX then retry. If you enabled this API recently, wait a few minutes for the action to propagate to our systems and retry.
```

これは Cloud SQL Admin API を有効にしていなかったから。マイグレーションするためには、この API が必要。 `Enable it by visiting` の後に出力された URL にアクセスして有効化する。GitHub Actions をリトライする。成功した。

では、実際にマイグレーションができたかを確認する。Cloud Shell から Cloud SQL へ接続する。

https://cloud.google.com/sql/docs/postgres/connect-instance-cloud-shell?hl=ja

Cloud Shell を起動し、以下のコマンドを実行する。

```shell
gcloud sql connect myinstance --user=postgres
```

`myinstance` は Cloud SQL インスタンス名。すると、psql が起動する。

まずは、データベースへの接続から。

```shell
\connect databasename;
```

`databasename`はデータベース名に書き換える。次に schema の確認。

```
SELECT current_schema();
 current_schema
----------------
 public
(1 row)
```

ここで違う場合は schema の一覧を取得して、正しい schema を指定する。

```shell
\dn
SET search_path TO schema_name;
```

`schema_name` は schema の名前に書き換える。最後に `\dt` でテーブルの一覧を取得する。

```shell
\dt
                List of relations
 Schema  |        Name        | Type  |  Owner
---------+--------------------+-------+----------
 public | _prisma_migrations | table | postgres
 public | posts              | table | postgres
 public | users              | table | postgres
(3 rows)
```

## 終わりに

今度は、マイグレーションが失敗したときように、ロールバックする仕組みを用意したい。
