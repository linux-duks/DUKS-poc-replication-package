import polars as pl
import orjson


# take a list of stringified json list[dicts], parses, and joins them into a single list
def merge_aggregated_attributions(attributions_list: list[str]) -> str | None:
    merged = []
    if not attributions_list.is_empty():
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
    # df = pl.read_csv("../data/enhanced.csv", separator="|", try_parse_dates=True).lazy()
    df = pl.read_parquet("../data/enhanced.parquet")  # .lazy()

    print(df.head())
    df = df.lazy()
    df = df.group_by(
        pl.col("committer_date").dt.truncate("1d").alias("committer_date")
    ).agg(
        # number_of_commits
        pl.len().alias("number_of_commits"),
        # insertions
        pl.col("insertions").sum(),
        # deletions
        pl.col("deletions").sum(),
        # attributions
        pl.col("attributions").filter(pl.col("attributions") != "[]"),
        # TODO: return fields when using this code to window functions
        # pl.col("author") if windw_date_size,
        # pl.col("committer") if windw_date_size,
        # tag
        pl.col("tag").unique(),
        # extra_contributors
        pl.col("extra_contributors")
        # extra_contributors
        .filter(pl.col("extra_contributors") != [])
        .flatten()
        .unique(),
        # all_contributors
        pl.col("all_contributors")
        .filter(pl.col("all_contributors") != [])
        .flatten()
        .unique(),
        # declared_maintainers
        pl.col("declared_maintainers").max(),
        # author_in_maintainers_file
        pl.col("author_in_maintainers_file").unique(),
        # committer_in_maintainers_file
        pl.col("committer_in_maintainers_file").unique(),
        # extra_attributions_in_maintainers_file
        pl.col("extra_attributions_in_maintainers_file").flatten().unique(),
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
                lambda tags: "" if len or len(tags) < 1 else " ".join(tags),
                return_dtype=pl.String,
            )
            .alias("tag"),
            # remove null emelemnts in list
            pl.col("extra_attributions_in_maintainers_file").list.drop_nulls(),
        ]
    )

    df = df.sort("committer_date", descending=False)
    # collect here, next rolling operations are not available in the lazy frame
    df = df.collect()

    # fill non existing dates with null values
    df = df.upsample(time_column="committer_date", every="1d")

    # all commits before a change have the same declared contributors
    df = df.with_columns(
        [
            pl.col("declared_maintainers").fill_null(strategy="backward"),
        ]
    )
    # does the same, but fixing the tail end of the df
    df = df.with_columns(
        [
            pl.col("declared_maintainers").fill_null(strategy="forward"),
            # also fill empty lists
            pl.col("number_of_commits").fill_null(strategy="zero"),
            pl.col("insertions").fill_null(strategy="zero"),
            pl.col("deletions").fill_null(strategy="zero"),
            pl.col("author_in_maintainers_file").fill_null(value=[]),
            pl.col("committer_in_maintainers_file").fill_null(value=[]),
            pl.col("extra_attributions_in_maintainers_file").fill_null(value=[]),
        ]
    )

    # only run windowing if requested
    if window_date_size:
        # count number of unique authors over the windw_date_size period
        df = df.with_columns(
            # committers
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
    df = pl.read_csv("../data/tags.csv", separator="|", infer_schema=False)

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
    print(data.columns)
    # print(data.head().to_dict())
