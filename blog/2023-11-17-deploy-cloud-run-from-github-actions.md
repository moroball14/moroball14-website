---
slug: deploy-cloud-run-from-github-actions
title: GitHub Actionsから Cloud Run with Cloud SQL にデプロイするには
authors: moroball14
tags: ["Google Cloud", "Cloud Run", "GitHub Actions"]
---

GitHub Actions から Cloud Run with Cloud SQL をデプロイするための仕組みを構築してみた。

https://cloud.google.com/blog/ja/products/devops-sre/deploy-to-cloud-run-with-github-actions

<!--truncate-->

GitHub Actions から Cloud SQL へのマイグレーションを行うステップが気になる方は、以下の記事を参照してほしい。

https://moroball14.github.io/moroball14-website/blog/migrate-cloud-sql-from-github-actions

上記ページから遷移できる、 sample repository のコードを見てみる。

https://github.com/google-github-actions/example-workflows/blob/main/workflows/create-cloud-deploy-release/cloud-deploy-to-cloud-run.yml

これみた感じ、ステップとしては、

- Workload Identity 連携を構成する
- `gcloud` コマンドを実行できるようにする
- Docker の認証を設定する
- Docker をビルドして、作成された Docker イメージをプッシュする
- Cloud Deploy を利用して Cloud Run にデプロイする

って感じっぽい。Cloud Deploy を使うメリットって何だろうって調べたら、DORA が提唱する four key metrics のうち、頻度だったり失敗率を計測してくれるらしい ↓

https://cloud.google.com/deploy/docs/metrics?hl=ja

これは嬉しいかも。ただそれほどリッチでなくていいので今回は Cloud Deploy は使わずに、Cloud Run にデプロイする方法を調べる。

再利用される前提のワークフローが作成されているのでそれを確認すると、、

- Dockerfile を使用してコンテナイメージをビルドする
- コンテナイメージを Artifact Registry に push する
- 該当する Google Cloud プロジェクト内の Cloud Run にコンテナイメージをデプロイする

というステップがある。

ビルドの段階では、

- checkout アクションを実行する
- auth アクション実行して Workload Identity 連携を構成する
- Docker Auth を実行して認証を行う
- tag つけてビルドおよびプッシュする

って感じだな。これが継続的インテグレーションのワークフローっぽい。

デプロイの段階では、

- 環境変数のセット
- envsubst で環境変数を埋め込んだマニフェストファイルを作成
- `deploy-cloudrun` アクションを実行してデプロイ

か。やること整理すると、

- ビルドの設定
  - Workload Identity 連携を構成する
  - Docker に対する認証を行う
  - `build-push-action` を使ってビルドおよびプッシュする
- デプロイの設定
  - push 時に動くデプロイ用の GitHub Actions ファイルを作成する
  - デプロイする workflow ファイルを作成する
    - 環境は一つしかないが、一旦この方針で進める
  - ステップを構成する
    - 環境変数のセット
    - envsubst で環境変数を埋め込んだマニフェストファイルを作成
    - `deploy-cloudrun` アクションを実行してデプロイ
  - Cloud Run のマニフェストファイルを作成する
  - 必要な secrets を GitHub に設定する
  - デプロイが成功したら、Cloud Run の URL にアクセスして確認する

になるか。

## ビルドの設定

### 1. Workload Identity 連携を構成する

```yaml
- id: "auth"
  name: "Authenticate to Google Cloud"
  uses: "google-github-actions/auth@v1"
  with:
    create_credentials_file: true
    workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
    service_account: ${{ secrets.WORKLOAD_IDENTITY_SA }}
    token_format: "access_token"
```

token_format は `access_token` にしておく。これは、Docker に対する認証を行う際に利用するため。

### 2. Docker に対する認証を行う

```yaml
- name: "Docker Auth"
  uses: "docker/login-action@v1"
  with:
    username: "oauth2accesstoken"
    password: ${{ steps.auth.outputs.access_token }}
    registry: "${{ vars.REGION }}-docker.pkg.dev"
```

### 3. `build-push-action` を使ってビルドおよびプッシュする

```yaml
- name: Build, tag and push container
  id: build-image
  uses: docker/build-push-action@v3
  with:
    context: ${{ vars.code_directory }}
    push: true
    tags: |
      ${{ vars.REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/${{ vars.ARTIFACT_REPO }}/${{ vars.SERVICE_NAME }}:${{ inputs.ref }}
```

## デプロイの設定

### 1. push 時に動くデプロイ用の GitHub Actions ファイルを作成する

```shell
$ touch .github/workflows/deploy-to-cloud-run.yaml
```

### 2. デプロイする workflow ファイルを作成する

```shell
$ touch .github/workflows/_deployment.yaml
```

### 3. ステップを構成する

`.github/workflows/deploy-to-cloud-run.yaml`

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  production:
    uses: ./.github/workflows/_deployment.yaml
    permissions:
      id-token: write
      contents: read
    with:
      environment: production
      ref: ${{ github.sha }}
    secrets: inherit
```

secrets に `inherit` を指定しないと、呼び出した workflow で secrets が参照できない。

`.github/workflows/_deployment.yaml`

```yaml
name: Reusable Deployment

on:
  workflow_call:
    inputs:
      environment:
        description: "Environment to deploy to"
        required: true
        default: "staging"
        type: string
      ref:
        description: "Git ref to deploy"
        required: true
        default: "main"
        type: string

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: "actions/checkout@v4"
      - id: "auth"
        name: "Authenticate to Google Cloud"
        uses: "google-github-actions/auth@v1"
        with:
          create_credentials_file: true
          workload_identity_provider: ${{ secrets.WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.WORKLOAD_IDENTITY_SA }}
          token_format: "access_token"
      - name: "Docker Auth"
        uses: "docker/login-action@v1"
        with:
          username: "oauth2accesstoken"
          password: ${{ steps.auth.outputs.access_token }}
          registry: ${{ vars.REGION }}-docker.pkg.dev
      - name: "Build and push image"
        id: build-image
        uses: "docker/build-push-action@v3"
        with:
          context: .
          push: true
          tags: |
            ${{ vars.REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/${{ vars.ARTIFACT_REPO }}/${{ vars.SERVICE_NAME }}:${{ inputs.ref }}
      - name: Create Service declaration
        run: |-
          export CONTAINER_IMAGE="${{ vars.REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/${{ vars.ARTIFACT_REPO }}/${{ vars.SERVICE_NAME }}:${{ inputs.ref }}"
          export SERVICE_NAME="${{ vars.SERVICE_NAME }}"
          export PROJECT_ID="${{ vars.GCP_PROJECT_ID }}"
          export REVISION_TAG="${{ inputs.ref }}"
          export CLOUD_RUN_SA="${{ vars.CLOUD_RUN_SA }}"
          export ENVIRONMENT="${{ inputs.environment }}"
          export DATABASE_URL="${{ secrets.DATABASE_URL }}"
          envsubst < ./.github/workflows/service-yaml/container.yaml > container-${{ inputs.environment }}.yaml
          cat container-${{ inputs.environment }}.yaml
      - name: Deploy to Cloud Run
        id: deploy
        uses: google-github-actions/deploy-cloudrun@v1
        with:
          region: ${{ vars.REGION }}
          metadata: container-${{ inputs.environment }}.yaml
      - name: Show Output
        run: echo ${{ steps.deploy.outputs.url }}
```

DATABASE_URL は、Cloud Run から Cloud SQL に繋げるために必要な環境変数。ORM には Prisma を利用していて、DATABASE_URL を参照するように設定しているため必要。

### 4. Cloud Run のマニフェストファイルを作成する

`envsubst < ./.github/workflows/service-yaml/container.yaml > container-${{ inputs.environment }}.yaml` とあるように、事前に作成したマニフェストファイルをもとに、環境ごとの環境変数を埋め込んだマニフェストファイルが作成される。（今回は 1 つの環境にしかデプロイしないが、商用では開発用、検証用などといくつか環境を用意することを想定している）

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ${SERVICE_NAME}
  namespace: ${PROJECT_ID}
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "100"
    spec:
      containers:
        - image: ${CONTAINER_IMAGE}
          ports:
            - containerPort: 3000
          env:
            - name: ENVIRONMENT
              value: ${ENVIRONMENT}
            - name: DATABASE_URL
              value: ${DATABASE_URL}
            - name: NODE_ENV
              value: ${ENVIRONMENT}
  traffic:
    - percent: 100
      latestRevision: true
```

このマニフェストファイル初めて作ったので、遭遇したエラーをメモ。

```shell
Error: google-github-actions/deploy-cloudrun failed with: failed to execute gcloud command `gcloud run services replace container-production.yaml --platform managed --format json --region us-central1`: ERROR: (gcloud.run.services.replace) Namespace must be project ID [XXX] or quoted number [1234567890] for Cloud Run (fully managed).
```

container.yaml の metadata.namespace を指定する必要があるらしい。

### 5. 必要な secrets や vars を GitHub に設定する

CLOUD_RUN_SA に関しては、以下のページを参考にした。

https://cloud.google.com/sql/docs/postgres/connect-instance-cloud-run?hl=ja#deploy_sample_app_to

Cloud Run のドキュメントにも記載がある通り、デフォルトの Compute Engine サービスアカウントとして実行されるため、上記ページの設定で良さそう。

https://cloud.google.com/run/docs/configuring/service-accounts?hl=ja

また、DATABASE_URL に関しては、GitHub Actions から Cloud SQL へ接続するために利用した文字列だと接続できなかった。GitHub Actions から接続した際は Cloud SQL Auth Proxy を利用していて、Cloud SQL インスタンスの情報は Cloud SQL Auth Proxy を利用する際に渡していた。

同じ文字列を渡すと以下のエラーが出る。

```shell
Deployment failed
ERROR: (gcloud.run.services.replace) Revision 'xxxxx' is not ready and cannot serve traffic. The user-provided container failed to start and listen on the port defined provided by the PORT=3000 environment variable. Logs for this revision might contain more information.
```

ログを確認できる URL が出力されていたので確認してみると Prisma のエラーが出ていた。

```shell
has no exported member
```

おそらく Prisma が生成する型情報が存在しないのかなと思いつつ調べてみたら、以下の記事を見つけたので試してみる。

https://zenn.dev/tsucchiiinoko/articles/bbf61e5e69e1ab

コンテナ起動時に `npx prisma generate` を実行するように変更して、Prisma が生成する型情報を生成、エラーが出なくなった。

`postgres://username:password@127.0.0.1:5432/databasename?host=/cloudsql/xxx`

の形式だと GitHub Actions から Cloud SQL のマイグレーションが失敗するが、

```
postgres://username:password@127.0.0.1:5432/databasename
```

の形式だと Cloud Run から Cloud SQL に繋げず、起動に失敗することが確認できた。

なので、Cloud Run 用に改めて環境変数を設定してみる。

```shell
diff --git a/.github/workflows/_deployment.yaml b/.github/workflows/_deployment.yaml
index 72c6741..8ee4051 100644
--- a/.github/workflows/_deployment.yaml
+++ b/.github/workflows/_deployment.yaml
@@ -49,7 +49,7 @@ jobs:
           export REVISION_TAG="${{ inputs.ref }}"
           export CLOUD_RUN_SA="${{ vars.CLOUD_RUN_SA }}"
           export ENVIRONMENT="${{ inputs.environment }}"
-          export DATABASE_URL="${{ secrets.DATABASE_URL }}"
+          export DATABASE_URL="${{ secrets.CLOUD_RUN_DATABASE_URL }}"
```

Cloud Run からと GitHub Actions からで環境変数を分けることにした。

が、それでもエラーが出る。

結局繋げていないなー。。。と思って Cloud Run から Cloud SQL に繋げるために何か必要かなーと調べたら、actions で、 `flags: --add-cloudsql-instances` というオプションを指定する必要があるらしい。のでつけたが

```shell
Error: google-github-actions/deploy-cloudrun failed with: failed to execute gcloud command `gcloud run services replace container-production.yaml --platform managed --format json --region us-central1 --add-cloudsql-instances ***`: ERROR: (gcloud.run.services.replace) unrecognized arguments:
  --add-cloudsql-instances
  ***
  To search the help text of gcloud commands, run:
  gcloud help -- SEARCH_TERMS
```

だったので、あれーと思って、もしや `container.yaml` の方か？と思って調べてみると

https://cloud.google.com/run/docs/reference/yaml/v1

に `run.googleapis.com/cloudsql-instances` についての記載があったので、これを設定してみる。

`container.yaml`

```yaml
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "100"
        run.googleapis.com/cloudsql-instances: ${CLOUD_SQL_CONNECTION}
```

`_deployment.yaml`

```yaml
- name: Create Service declaration
  run: |-
    export CONTAINER_IMAGE="${{ vars.REGION }}-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/${{ vars.ARTIFACT_REPO }}/${{ vars.SERVICE_NAME }}:${{ inputs.ref }}"
    ~~
    export CLOUD_SQL_CONNECTION="${{ secrets.CUSTOM_QUIZ_POSTGRES_INSTANCE }}" # ここを追加
    envsubst < ./.github/workflows/service-yaml/container.yaml > container-${{ inputs.environment }}.yaml
    cat container-${{ inputs.environment }}.yaml
```

CLOUD_SQL_CONNECTION を設定する。これは、接続名なので、 `project-id:region:instance-name` という形式で設定する。おそらくコンソール画面にもあるはず。

これで、Cloud Run から Cloud SQL に繋げて、デプロイができた。

### 6. デプロイが成功したら、Cloud Run の URL にアクセスして確認する

curl コマンドで認証を通して Cloud Run に POST リクエストを送る。

以下を参考。

https://cloud.google.com/run/docs/authenticating/developers?hl=ja#curl

```shell
$ curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" SERVICE_URL
```

データベースとの疎通確認を行い、デプロイが完了。

## おわりに

やっと公開できた。

あまり休みに時間が取れなかったので、Cloud SQL へのマイグレーションが実行できるようになってから 2 週間くらい経過してしまった。

Cloud SQL は動かし続けるとクラウド破産する気がしてならないので、必要な時だけ起動するように気をつけてほしい。
