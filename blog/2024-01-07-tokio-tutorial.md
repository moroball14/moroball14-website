---
slug: tokio-tutorial
title: Tokio のチュートリアルをやってみた
authors: moroball14
tags: ["Rust", "Tokio"]
---

Tokio のチュートリアルを進めつつ、内容をメモしていく。随時。

https://tokio.rs/tokio/tutorial

<!--truncate-->

Rust の main 関数が非同期関数になっている。

```rust
#[tokio::main]
async fn main() {
    println!("hello");
}
```

### Attribute Macro

`#[tokio::main]` は Attribute Macro と呼ばれるもので、関数や構造体などに新しい外部の属性を付与するもの。

https://doc.rust-lang.org/reference/procedural-macros.html#attribute-macros

`#[tokio::main]` は `tokio::runtime::Runtime` を作成して、その中で `main` 関数を実行するマクロなので、マクロがない場合は以下のように書くこともできる。

```rust
fn main() {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            println!("Hello world");
        })
}
```

ref: https://docs.rs/tokio/1.35.1/tokio/attr.main.html#using-the-multi-thread-runtime

実装を確認すると

```rust
#[proc_macro_attribute]
#[cfg(not(test))] // Work around for rust-lang/rust#62127
pub fn main(args: TokenStream, item: TokenStream) -> TokenStream {
    entry::main(args.into(), item.into(), true).into()
}
```

とある。entry というモジュールの main 関数を呼び出していることが確認できた。

ref: https://docs.rs/tokio-macros/2.2.0/src/tokio_macros/lib.rs.html#204-208

### Cargo.toml の設定

```toml
tokio = { version = "1", features = ["full"] }
```

> When attempting to optimize compile time or the end application footprint, the application can decide to opt into only the features it uses.

チュートリアルでは features に `full` を指定しているが、コンパイル時間やフットプリントを最適化したい場合は、使う機能だけを指定する。footprint という単語が聞き慣れていなかったので調べてみたら、たとえばメモリの使用量のことを "memory footprint" というらしい。小ンピュータサイエンスの文脈だと、資源という意味で使うのが適切か？

https://www.computerhope.com/jargon/f/footprin.htm

## tokio::spawn

tokio::spawn ではタスクの外部にあるデータへの参照を含んではいけない。

```rust
use tokio::task;

#[tokio::main]
async fn main() {
    let v = vec![1, 2, 3];

    task::spawn(async {
        println!("Here's a vec: {:?}", v);
    });
}
```

これは、コンパイルエラーが起きる。`v` は main 関数が所有したままなので、move で所有権を移動させる必要がある。

```rust
use tokio::task;

#[tokio::main]
async fn main() {
    let v = vec![1, 2, 3];

    task::spawn(async move {
        println!("Here's a vec: {:?}", v);
    });
}
```

複数のタスクから同じデータにアクセスする場合は、`Arc` という型を使う。

ref: https://zenn.dev/link/comments/097017b67c5908

## 補足

### Crate

Crate の仕様を確認するには、たとえば tokio なら以下のページが参考になる。

https://docs.rs/tokio/1.35.1/tokio/

https://crates.io/crates/tokio

前者はドキュメントとなっていて詳細を確認するためにはこちらを参照するのが良さそう。後者は内容としては GitHub の README で crate の概要を確認するために参照するのが良さそう。

前者は `rustdoc` コマンドで生成されるもので、以下の情報が参考になる。

https://doc.rust-lang.org/rustdoc/index.html

rustdoc の構造が把握できていない人は以下のページを最初に読んでおくと良さそう。

https://doc.rust-lang.org/rustdoc/how-to-read-rustdoc.html

この rustdoc で生成される tokio のドキュメントを見てみると、 `Modules`, `Macros`, `Attributes Macro` という項目に分かれていることがわかる。また、 `All Items` を押すと、 `Structs`, `Enums`, `Traits`, `Functions`, `Type Aliases` も追加で確認できる。

たとえば Module の中の `tokio::process` を見てみると、概要だったり実装例だったりが確認できる。またそのページの `Structs` にある `Child` という構造体のページに飛ぶと、今度はその実装なども参照できるようになっている。自分が欲しい情報の粒度に合わせて参照できるようになっていると、仕様理解やコードリーディングに困らない気がする。

Module tokio::process のページに飛んで source を確認してみる。

https://docs.rs/tokio/1.35.1/src/tokio/process/mod.rs.html#1-1678

このように、実装とそのドキュメントを同一ファイルに記述できる。記述方法を rustdoc の仕様に合わせることで、ドキュメントを生成することができる。

Rust はテストコードも実装と同じファイルに書くことができるので、テストコードとドキュメントと実装を同じファイルに書くことで、実装していない人でも内容の理解に役立てることができる。
