import polars as pl
import orjson


# reads a list of dicts, and returns a list of unique emails
def unique_emails_in_attributions(attributions: list[dict]) -> int | None:
    attributions = orjson.loads(attributions)
    if not attributions or len(attributions) == 0:
        return None
    return list(set([attr["email"] for attr in attributions]))


def load_data(window_date_size="2w"):
    # load data from csv
    df = pl.read_csv("../data/enhanced.csv", separator="|", try_parse_dates=True).lazy()

    # add column with unique contributors in commit
    df = df.with_columns(
        [
            pl.col("attributions")
            .map_elements(
                unique_emails_in_attributions, return_dtype=pl.List(pl.String)
            )
            .alias("extra_contributors")
        ]
    )

    # add column with extra_contributors concated with author and commiter
    df = df.with_columns(
        [
            pl.concat_list("author", "committer", "extra_contributors").alias(
                "all_contributors"
            )
        ]
    )

    # in case author and commiter are the same, filter uniqueness again
    df = df.with_columns([pl.col("all_contributors").list.unique()])

    # counts extra contributors in commit
    df = df.with_columns(
        pl.col("extra_contributors").list.len().alias("num_extra_contributors"),
    )

    # count all contributors in each commit
    df = df.with_columns(
        pl.col("all_contributors").list.len().alias("num_total_contributors"),
    )

    # sort the data frame before running rolling operation on top of date
    df = df.sort("committer_date", descending=False, maintain_order=True)

    # collect here, next rolling opperations are not available in the lazy frame
    df = df.collect()

    # count number of unique authors over the windw_date_size period
    df = df.with_columns(
        # commiters
        df.rolling(index_column="committer_date", period=window_date_size).agg(
            pl.n_unique("author").alias("unique_authors")
        )
    )

    # count number of unique committer over the windw_date_size period
    df = df.with_columns(
        # authors
        df.rolling(index_column="committer_date", period=window_date_size).agg(
            pl.n_unique("committer").alias("unique_committer")
        ),
    )

    # count number of total contributors over the windw_date_size period
    df = df.with_columns(
        df.rolling(index_column="committer_date", period=window_date_size).agg(
            pl.n_unique("all_contributors").alias("unique_contributors")
        ),
    )

    return df


def load_tags():
    df = pl.read_csv(
        "../data/tags.csv",
        separator="|",
    )

    # TODO: change order ?
    # df = df.sort(
    #     "tag", descending=False, maintain_order=True
    # )

    return df


# main used only to test locally, executing this script directly
if __name__ == "__main__":
    print()
    data = load_data()
    print(data)
    # print(data.head().to_dicts())
