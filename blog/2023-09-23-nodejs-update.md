---
slug: nodejs-update
title: Node.js 18へのアップデート対応したので振り返る
authors: moroball14
tags: ["Node.js"]
---

最近の仕事で、Node.js18 への移行を複数プロダクトで行ったので、振り返る。

<!--truncate-->

すべてフロントエンドのプロダクトだった。
二つのプロダクトで移行を行い、一つは直前に利用しているパッケージのメジャーバージョンをアップデートしていた。ESLint や Storybook などは最新にしたほか、legacy peer deps オプションを使っていたので、それを使わなくても良いように、アップデートを行なっていた。もう一つは、Webpack や ESLint などメジャーバージョンも古かった。

最新にアップデートを行なっていたプロダクトは、すんなり移行できた。
メジャーバージョンが古いパッケージを使っていたプロダクトの移行は、少し大変だった。

後者の移行手順としては、

- Node.js 18 を設定する
- `npm i` を実行する
- 出力されたエラーを一つずつ解消する
- scripts を全て叩いてみる
- 出力されたエラーを一つずつ解消する

と割と言葉にしたらシンプル。でも現実は結構大変だった。

そもそも利用しているパッケージが古いので、依存関係が解決できないエラーが何度も出た。

```shell
npm ERR! code ERESOLVE
npm ERR! ERESOLVE could not resolve
npm ERR!
npm ERR! While resolving: react-pose@4.0.10
npm ERR! Found: react@17.0.2
npm ERR! node_modules/react
npm ERR!   react@"^17.0.0" from the root project
npm ERR!   97 more (@design-systems/utils, ...)
npm ERR!
npm ERR! Could not resolve dependency:
npm ERR! peer react@"^16.3.2" from react-pose@4.0.10
npm ERR! node_modules/react-pose
npm ERR!   react-pose@"4.0.10" from the root project
npm ERR!
npm ERR! Conflicting peer dependency: react@16.14.0
npm ERR! node_modules/react
npm ERR!   peer react@"^16.3.2" from react-pose@4.0.10
npm ERR!   node_modules/react-pose
npm ERR!     react-pose@"4.0.10" from the root project
```

こんなエラー。その度にエラー内容を読み解いて解消していった。が、これが何度も出ると辛い。
でもやっていくうちにこのエラーが怖くなくなってきたし、解消できる喜びはやっぱりあるから、途中から楽しくなってきた。

解消方法としては、

```
npm ERR! While resolving
```

の後に続くパッケージが原因なので、そのパッケージのバージョンを変更するなり代替パッケージを探す。

```
npm ERR! Conflicting peer dependency
```

この後に続く内容が、何が依存解決に失敗したか、を表している。
上記では、 `react-pose@4.0.10` が依存している `react@16.14.0` を使おうとしたら、エラーが起きた。

```
npm ERR!   react@"^17.0.0" from the root project
```

というエラー文言のように、root では `^17.0.0` を要求しているので、ここで明らかにバージョンの差異が生まれている。こうなるとエラーが起きる。
この例では、`react-pose@4.0.10` をバージョンアップすることはできず、代替ライブラリが幸い存在した。react-pose のホームページに移行先として `framer-motion` を指定していたので、素直に`framer-motion`を利用した。
このように公式が移行先を指定していることもあれば、そうでないこともある。その場合は、「XXX migration」 のようなキーワードで検索を行ったり、 npm trends で類似のパッケージを探してみる。そうすると大抵見つかるので、あとは ChatGPT や GitHub Copilot を使って移行をしていく。

そうやって解決したあとも、 `npm start` でエラーが起きたりとあり、それらのエラー内容を読み解き解消していくと結果として、 `TypeScript` や `Webpack` ,
`Storybook` など、開発環境に必要なパッケージも移行していく必要があった。それなりに大変だった。

この活動をやっていて、今後必要だと思ったのは

- renovate を使って定期的にバージョンを最新にする
- バージョンを安心して上げるためにテストコードを書く
- テストコードを書きやすくするために、ラップして独立してテストコードを書く
  - たとえば `crypto-js` をプロダクションコードで使っていたら、 `crypto-js` に依存するクラスを一つだけ作ってそれに対してテストコードを書く。それ以外のコードでは `crypto-js` に依存しない。

あたりだなー。なので、次はこういう活動をチームでやれるように提案していく。
他にも何かしらありそうなので、思いついたら追加していく。
