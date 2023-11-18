---
slug: isucon-movie-1
title: 面白法人カヤックの社内ISUCONを解いている動画を見てみる 1
authors: moroball14
tags: ["ISUCON"]
---

ISUCON を解いている動画を見てみるので、学びをメモする。
2 回以上練習するぞ、という意志があるので 1 をつけてみる（笑）

動画 -> https://www.youtube.com/watch?v=BD4kKgxC_CY&t=0s

GitHub リポジトリ -> https://github.com/kayac/kayac-isucon-2022

<!--truncate-->

まずはリポジトリに沿ってローカルで実行していく。

途中 Go をインストールしていなかったので、

```shell
$ brew install go
```

を実行する。

## htop

```shell
$ brew install htop
```

を実行して使う。

htop とは、top コマンドの拡張版で、プロセスの CPU 使用率やメモリ使用率、プロセスのツリー構造などを見やすく表示してくれる。（いわゆるタスクマネージャー）

https://ja.wikipedia.org/wiki/Htop

デフォルト(Shift + P)では、プロセスを CPU 使用率の順に並べてくれる。

Shift + M でメモリ使用率の順に並べてくれる。

Shift + T でプロセスを CPU 使用時間の順に並べてくれる。

、、、動画では、mysql がかなり CPU を消費していた。ローカル環境で実行すると、Docker が CPU を消費していそうな気配を感じて、mysql に着手すればいいのかわからん。が、今回は mysql を早くしていこうという前提で先に進める。

htop コマンドを立ち上げたインスタンスで実行できるようにしておくことが良いかも。

## mysql 周り

```shell
$ docker compose up mysql /bin/bash
$ mysql -uroot -proot --host 127.0.0.1 --port 3306 isucon_listen80
```

これで mysql に入れる。ローカルに mysql をインストールしていないので、コンテナにアタッチして mysql をいじることにする。（そのため 13306 ではなく 3306）

これ以降は catatsuy さんの進め方になぞっていき、その過程で知識を整理していくことにする。

参考: https://github.com/catatsuy/memo_isucon

とりあえずスキーマだけを得る。

```shell
mysqldump -uroot -proot --host 127.0.0.1 --port 3306 --compact --no-data isucon_listen80 | grep -v "^SET" | grep -v "^/\*\!" | perl -ple 's@CREATE TABLE @\nCREATE TABLE @g';
```

とあったが、perl を実行できなかったので、perl なしで。

確かにスキーマを確認できた。

次にテーブルサイズを確認する。

```shell
+-------------------+--------+------------+----------+---------+----------+
| TABLE_NAME        | ENGINE | TABLE_ROWS | total_mb | data_mb | index_mb |
+-------------------+--------+------------+----------+---------+----------+
| playlist_song     | InnoDB |    9947169 |      407 |     407 |        0 |
| playlist_favorite | InnoDB |    2861084 |      373 |     172 |      201 |
| song              | InnoDB |     344137 |       41 |      41 |        0 |
| playlist          | InnoDB |     255236 |       30 |      30 |        0 |
| user              | InnoDB |      29892 |        5 |       5 |        0 |
| artist            | InnoDB |      29978 |        3 |       3 |        0 |
| sessions          | InnoDB |         18 |        0 |       0 |        0 |
+-------------------+--------+------------+----------+---------+----------+
```

行数多いのに、 `playlist_song` の index が 0 は大変だ。 `index_length` とは、インデックスのサイズのことで、これが 0 ということは、インデックスが効いていないということ。

なので、スロークエリを確認する。そのために mysql.conf の設定を変更するのと、スロークエリを吐く場所を決める。今回は、mysql/logs というディレクトリをローカルとコンテナで同期していそうだったので、そこに吐くことにする。

`webapp/mysql//my.conf` の設定を変更する。

```shell
[mysqld]

# 何かしらある

slow_query_log = 1
log_slow_extra = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 0
```

おー、こうしたら同期している `webapp/mysql/logs/slow.log` にスロークエリが吐かれた。

それぞれの設定について補足すると、

- `slow_query_log` はスロークエリを吐くかどうか
- `log_slow_extra` はスロークエリの詳細を吐くかどうか
- `slow_query_log_file` はスロークエリを吐く場所
- `long_query_time` はスロークエリとして扱う時間

そもそもスロークエリとは、実行時間が長いクエリのこと。 `long_query_time` は、この実行時間の閾値を設定するもの。

で、このスロークエリを見やすくしてくれるのが、 `pt-query-digest` 。

これにスロークエリのログを渡してテキストファイルを作成する。

docker だけでやろうとしたら結構面倒くさかった。

- `pt-query-digest` をインストールする
- `./bench` でベンチマークを実行する
- `pt-query-digest` にスロークエリのログを渡してテキストファイルを作成する
- コンテナからホストにコピーする

最後のコンテナからホストにコピーするのは、docker compose の設定上同期されていなかったから。頻繁に行うのであれば、設定した方が良い。

まあとりあえずコンテナで行っていることの煩わしさは一旦無視して、実行結果を見てみる。

```txt
# 3s user time, 640ms system time, 37.18M rss, 41.12M vsz
# Current date: Sat Nov 18 07:38:58 2023
# Hostname: b5a22145d3f4
# Files: ./slow.log
# Overall: 22.45k total, 38 unique, 79.04 QPS, 0.41x concurrency _________
# Time range: 2023-11-18T07:34:02 to 2023-11-18T07:38:46
# Attribute          total     min     max     avg     95%  stddev  median
# ============     ======= ======= ======= ======= ======= ======= =======
# Exec time           116s     2us      8s     5ms     1ms    75ms   167us
# Lock time          125ms       0    52ms     5us     3us   364us     1us
# Rows sent          2.50M       0 252.75k  116.64    0.99   4.50k    0.99
# Rows examine     186.23M       0  19.76M   8.50k  174.84 155.69k    0.99
# Bytes sent       188.08M       0  16.44M   8.58k  652.75 346.75k  271.23
# Query size         1.11M       6     336   51.81  112.70   25.31   34.95
# Bytes receiv           0       0       0       0       0       0       0
# Created tmp            2       0       1    0.00       0    0.01       0
# Created tmp            2       0       1    0.00       0    0.01       0
# Errno                  0       0       0       0       0       0       0
# Read first           467       0       2    0.02       0    0.14       0
# Read key           1.04M       0 539.18k   48.51    0.99   4.26k    0.99
# Read last              0       0       0       0       0       0       0
# Read next         17.48M       0   2.75M  816.65   62.76  40.05k       0
# Read prev              0       0       0       0       0       0       0
# Read rnd               0       0       0       0       0       0       0
# Read rnd nex     157.10M       0   9.93M   7.17k       0  96.69k       0
# Sort merge p         130       0      10    0.01       0    0.22       0
# Sort range c           0       0       0       0       0       0       0
# Sort rows          2.47M       0 252.75k  115.39       0   4.50k       0
# Sort scan co          35       0       1    0.00       0    0.04       0

# Profile
# Rank Query ID                           Response time Calls R/Call V/M
# ==== ================================== ============= ===== ====== =====
#    1 0xEF4E32253D50FC6205E21CEE5B40F6F1 45.5258 39.2%   346 0.1316  0.02 SELECT playlist
#    2 0x0A24D4A57D22B71F538F1AE200CFCE54 15.5064 13.3%    76 0.2040  0.03 SELECT song
#    3 0x5273158DAA0FBFCB4E4B5FD45972E14C 14.9349 12.9%    10 1.4935  0.32 SELECT playlist_favorite
#    4 0xF5B583C744AF7186989E4866032FECC8 11.2656  9.7%    10 1.1266  0.26 SELECT playlist
#    5 0xBB803527F0B05ED37FAF2BBD29AD2CB4  7.6150  6.6%     1 7.6150  0.00 DELETE SELECT playlist_song playlist
#    6 0x4FFEDD9537D4E9B44DEB7A24247FE1ED  6.1058  5.3%     5 1.2212  0.12 SELECT playlist_favorite
#    7 0x7AB57DAE0FB77B087E0D1340C39A97AD  3.4641  3.0%     1 3.4641  0.00 DELETE SELECT playlist_favorite playlist
#    8 0xCFDD294F672FC7ED341FAC0294AB364A  2.4830  2.1%  6317 0.0004  0.01 SELECT song
#    9 0x75F43F95B7E689606BBB5B7D6427CFC1  1.6766  1.4%  6317 0.0003  0.01 SELECT artist
#   10 0xEC063962A0903583D4BF22B4F6620A35  1.4936  1.3%  1902 0.0008  0.01 SELECT playlist_favorite
...
```

こんな感じ。

Overall は全体の統計情報で、

- 分析対象のクエリ数
- ユニークなクエリ数
- 秒間のクエリの平均実行回数
- 同時に実行されたクエリの平均数

となっている。

Time range は実行時間の範囲を示す。

Attribute は属性ごとの統計情報で

- Exec time: クエリの実行時間に関する統計情報
- Lock time: クエリのロックに関する統計情報
- Rows sent: 送信された行の数
- Rows examine: 調査された行の数
- Bytes sent: 送信されたバイト数
- Query size: クエリのサイズ（バイト）
- Sort rows: ソートされた行の数

で、Profile がクエリごとの実行統計となっていて、Response time ごとに並べてくれている。一番上から改善していくと良い。

一つ見てみる。

```
# Query 1: 4.17 QPS, 0.55x concurrency, ID 0xEF4E32253D50FC6205E21CEE5B40F6F1 at byte 19059139
# This item is included in the report because it matches --limit.
# Scores: V/M = 0.02
# Time range: 2023-11-18T07:37:21 to 2023-11-18T07:38:44
# Attribute    pct   total     min     max     avg     95%  stddev  median
# ============ === ======= ======= ======= ======= ======= ======= =======
# Count          1     346
# Exec time     39     46s    50ms   288ms   132ms   208ms    56ms   116ms
# Lock time      0     1ms       0   157us     3us     7us     9us     1us
# Rows sent      0     345       0       1    1.00    0.99    0.05    0.99
# Rows examine  45  85.40M 252.75k 252.75k 252.75k 245.21k       0 245.21k
# Bytes sent     0 222.80k     524     696  659.39  685.39   19.15  652.75
# Query size     1  22.30k      66      66      66      66       0      66
# Bytes receiv   0       0       0       0       0       0       0       0
# Created tmp    0       0       0       0       0       0       0       0
# Created tmp    0       0       0       0       0       0       0       0
# Errno          0       0       0       0       0       0       0       0
# Read first    74     346       1       1       1       1       0       1
# Read key       0     346       1       1       1       1       0       1
# Read last      0       0       0       0       0       0       0       0
# Read next      0       0       0       0       0       0       0       0
# Read prev      0       0       0       0       0       0       0       0
# Read rnd       0       0       0       0       0       0       0       0
# Read rnd nex  54  85.40M 252.75k 252.75k 252.75k 245.21k       0 245.21k
# Sort merge p   0       0       0       0       0       0       0       0
# Sort range c   0       0       0       0       0       0       0       0
# Sort rows      0       0       0       0       0       0       0       0
# Sort scan co   0       0       0       0       0       0       0       0
# String:
# End          2023-11-18... (2/0%), 2023-11-18... (1/0%)... 343 more
# Hosts        webapp-app-1.webapp_default
# Start        2023-11-18... (1/0%), 2023-11-18... (1/0%)... 344 more
# Users        isucon
# Query_time distribution
#   1us
#  10us
# 100us
#   1ms
#  10ms  #############################
# 100ms  ################################################################
#    1s
#  10s+
# Tables
#    SHOW TABLE STATUS LIKE 'playlist'\G
#    SHOW CREATE TABLE `playlist`\G
# EXPLAIN /*!50100 PARTITIONS*/
SELECT * FROM playlist WHERE `ulid` = '01G2XHCBVR7Q219AEENPXH1V2X'\G
```

ulid で検索しているクエリ。このテーブルの件数を見てみる。

```sql
select count(*) from playlist;
+----------+
| count(*) |
+----------+
|   258816 |
+----------+
```

なるほど、少し前に取得した schema を確認すると

```shell
CREATE TABLE `playlist` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `ulid` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `user_account` varchar(191) NOT NULL,
  `is_public` tinyint NOT NULL,
  `created_at` timestamp(3) NOT NULL,
  `updated_at` timestamp(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=360447 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

と index を貼っていない。これだと遅いのは明らかなので、index を貼る。

```sql
CREATE INDEX idx_ulid ON playlist (ulid);
```

ちなみに、以下で現状のデータベースの情報を sql 文の形式で確認できるらしい。知らなかった。

```sql
show create table playlist;
```

```shell
CREATE TABLE `playlist` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `ulid` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `user_account` varchar(191) NOT NULL,
  `is_public` tinyint NOT NULL,
  `created_at` timestamp(3) NOT NULL,
  `updated_at` timestamp(3) NOT NULL,
  PRIMARY KEY (`id`)
  KEY `idx_ulid` (`ulid`)
) ENGINE=InnoDB AUTO_INCREMENT=360447 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

これでベンチマークを取り直すと、

```
SCORE: 231 (+241 -10)
```

から

```
SCORE: 341 (+341 0)
```

になった。

一つ改善する、というプロセスを経ることができたので今日は終了。
