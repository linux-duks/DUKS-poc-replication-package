import polars as pl


def load_by_commits(window_date_size=None):
    df = pl.read_parquet("../data/by_commit.parquet")

    return df


# short-hand for appliying the rolling_count
def rolling_count_row_of_lists(
    series: pl.Series, index_column: str, period: str
) -> pl.Series:
    return (
        series.flatten()
        .drop_nulls()
        .n_unique()
        .rolling(index_column=index_column, period=period)
    )


def load_data(window_date_size="1d"):
    df = pl.read_parquet("../data/by_date.parquet").lazy()

    if window_date_size is None:
        window_date_size = "1d"

    # count number of total contributors over the windw_date_size period
    df = df.with_columns(
        [
            # all_contributors
            rolling_count_row_of_lists(
                pl.col("all_contributors"), "committer_date", window_date_size
            ).alias("rolling_count_contributors"),
            # authors
            rolling_count_row_of_lists(
                pl.col("author"), "committer_date", window_date_size
            ).alias("rolling_count_authors"),
            # committer
            rolling_count_row_of_lists(
                pl.col("committer"), "committer_date", window_date_size
            ).alias("rolling_count_committers"),
            # extra_contributors (not author nor committer)
            rolling_count_row_of_lists(
                pl.col("extra_contributors"), "committer_date", window_date_size
            ).alias("rolling_count_extra_contributors"),
            rolling_count_row_of_lists(
                pl.col("attributions_ack"), "committer_date", window_date_size
            ).alias("attributions_ack"),
            rolling_count_row_of_lists(
                pl.col("attributions_reviewed"), "committer_date", window_date_size
            ).alias("attributions_reviewed"),
            rolling_count_row_of_lists(
                pl.col("attributions_reported"), "committer_date", window_date_size
            ).alias("attributions_reported"),
            rolling_count_row_of_lists(
                pl.col("attributions_suggested"), "committer_date", window_date_size
            ).alias("attributions_suggested"),
            rolling_count_row_of_lists(
                pl.col("attributions_tested"), "committer_date", window_date_size
            ).alias("attributions_tested"),
        ]
    )

    # remove email lists to keep only counts
    df = df.drop(
        "all_contributors",
        "author",
        "author_in_maintainers_file",
        "attributions",
        "committer",
        "committer_in_maintainers_file",
        "extra_attributions_in_maintainers_file",
        "extra_contributors",
    )

    # send date as yyyy-mm-dd
    df = df.with_columns(
        pl.col("committer_date").dt.strftime("%Y-%m-%d").alias("committer_date")
    )

    return df.collect()


# TODO: there are missing tags
def load_tags():
    df = pl.read_csv(
        "../data/tags.csv",
        separator="|",
        infer_schema=False,  # try_parse_dates=True
    )

    # TODO: change order ?
    # df = df.sort(
    #     "tag", descending=False, maintain_order=True
    # )
    #

    df = df.with_columns(
        pl.when(pl.col(pl.String).str.len_chars() == 0)
        .then(None)
        .otherwise(pl.col(pl.String))
        .name.keep()
    )

    df = df.group_by(pl.col("tag")).agg(
        pl.col("commit"), pl.col("date").drop_nulls().first()
    )

    # df = df.with_columns(pl.col("date").str.to_date("%Y-%m-%d"))
    # send date as yyyy-mm-dd
    # df = df.with_columns(pl.col("date").dt.strftime("%Y-%m-%d").alias("date"))

    return df


# main used only to test locally, executing this script directly
if __name__ == "__main__":
    import orjson

    print()
    data = load_tags()
    # data = load_data("14d")
    print(data)
    data.write_ndjson("demo.ndjson")
    print(data.columns)
    print(orjson.dumps(data.tail(10).to_dict(as_series=False)).decode())
