import polars as pl
import orjson


# reads a list of dicts, and returns a list of unique emails
def unique_emails_in_attributions(attributions: list[str]) -> int | None:
    attributions = orjson.loads(attributions)
    if not attributions or len(attributions) == 0:
        return None
    return list(set([attr["email"] for attr in attributions]))


# take a list of stringified json list[dicts], parses, and joins them into a single list
def merge_aggregated_attributions(attributions_list: list[str]) -> str | None:
    merged = []
    for attributions in attributions_list:
        attributions = orjson.loads(attributions)
        if isinstance(attributions, list):
            merged = merged + attributions
        else:
            merged.append(attributions)

    # TODO: deduplication
    # return set([orjson.dumps(element, sort_keys=True) for element in merged])
    return orjson.dumps(merged).decode()


def load_data(window_date_size=None):
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
    df = df.with_columns(
        [pl.col("all_contributors").list.unique().alias("all_contributors")]
    )

    # counts extra contributors in commit
    df = df.with_columns(
        pl.col("extra_contributors").list.len().alias("num_extra_contributors"),
    )

    # count all contributors in each commit
    df = df.with_columns(
        pl.col("all_contributors").list.len().alias("num_total_contributors"),
    )

    df = df.sort("committer_date", descending=False)

    df = df.group_by(
        pl.col("committer_date").dt.truncate("1d").alias("committer_date")
    ).agg(
        pl.len().alias("number_of_commits"),
        pl.col("insertions").sum(),
        pl.col("deletions").sum(),
        pl.col("attributions").filter(pl.col("attributions") != "[]"),
        # TODO: return fields when using this code to window functions
        # pl.col("author") if windw_date_size,
        # pl.col("committer") if windw_date_size,
        pl.col("tag").unique(),
        pl.col("extra_contributors")
        .filter(pl.col("extra_contributors") != [])
        .flatten()
        .unique(),
        pl.col("all_contributors")
        .filter(pl.col("all_contributors") != [])
        .flatten()
        .unique(),
    )

    df = df.with_columns(
        [
            # attributions were aggregated by combining list of strings. Parse their jsons here, and merge into a single json
            pl.col("attributions")
            .map_elements(merge_aggregated_attributions, return_dtype=pl.String)
            .alias("attributions"),
            #
            # coalease tags into a space separated string, or null
            pl.col("tag")
            .map_elements(
                lambda tags: None if len or len(tags) < 1 else " ".join(tags),
                return_dtype=pl.String,
            )
            .alias("tag"),
        ]
    )

    # collect here, next rolling opperations are not available in the lazy frame
    df = df.collect()

    # fill non existing dates with null values
    # TODO: upsampling break graph at the atm
    # df = df.upsample(time_column="committer_date", every="1d")

    # only run windowing if requested
    if window_date_size:
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


# TODO: there are missing tags
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
