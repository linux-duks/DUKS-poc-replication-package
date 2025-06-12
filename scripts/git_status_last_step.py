import logging
import orjson
import os
import polars as pl
import duckdb


DEBUG = os.getenv("DEBUG", "false")
level = logging.INFO
if DEBUG != "false":
    level = logging.DEBUG

logging.basicConfig(
    level=level,
    format="[%(asctime)s] {%(pathname)s:%(lineno)d} %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)


# reads a list of dicts, and returns a list of unique emails
def unique_emails_in_attributions(attributions: list[str]) -> int | None:
    attributions = orjson.loads(attributions)
    if not attributions or len(attributions) == 0:
        return None
    return list(set([attr["email"] for attr in attributions]))


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


def run():
    commits = pl.read_csv("../data/enhanced.csv", separator="|", try_parse_dates=True)
    print(commits.head())

    maintainers = pl.read_csv("../data/maintainers.csv", separator="|")

    maintainers = maintainers.with_columns(
        [
            # parse to list
            pl.col("maintainers")
            .map_elements(
                # load maintainers and de-duplicate them
                lambda m: list(set(orjson.loads(m))),
                return_dtype=pl.List(pl.String),
            )
            .alias("maintainers"),
        ]
    )

    print(maintainers.head())

    logging.info("Runningn query in duckdb")
    df = (
        duckdb.sql("""
        SELECT c.*, m.maintainers as maintainers , len(m.maintainers) as declared_maintainers FROM commits c
        left join maintainers m on
        c.commit == m.commit 
        order by committer_date
    """)
        .pl()
        .lazy()
    )

    # all commits before a change have the same declared contributors
    df = df.with_columns(
        [
            pl.col("maintainers").fill_null(strategy="backward"),
            pl.col("declared_maintainers").fill_null(strategy="backward"),
        ]
    )
    # does the same, but fixing the tail end of the df
    df = df.with_columns(
        [
            pl.col("maintainers").fill_null(strategy="forward"),
            pl.col("declared_maintainers").fill_null(strategy="forward"),
        ]
    )

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

    # add column with extra_contributors concated with author and committer
    df = df.with_columns(
        [
            pl.concat_list("author", "committer", "extra_contributors").alias(
                "all_contributors"
            )
        ]
    )

    # in case author and committer are the same, filter uniqueness again
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

    def intersect(row: pl.Struct):
        mset = set(row["maintainers"])
        author = None
        committer = None
        extra = []
        # intersection between authors and maintainers file
        if row["author"] in mset:
            author = row["author"]
        # intersection between committer and maintainers file
        if row["committer"] in mset:
            committer = row["committer"]
        # intersection between extra_contributors and maintainers file
        for attr in row["extra_contributors"]:
            if attr is not None:
                if attr in mset:
                    extra.append(attr)
        return {
            "author_in_maintainers_file": author,
            "committer_in_maintainers_file": committer,
            "extra_attributions_in_maintainers_file": extra,
        }

    # def intersections(row):
    # mainteiners = set(row["maintainers"])
    # commiter = row["committer"]

    logging.info("intersections")
    # run intersections between maintainers and other columns
    df = df.with_columns(
        # intersection between authors and maintainers file
        pl.struct(["author", "committer", "extra_contributors", "maintainers"])
        .map_elements(
            intersect,
            return_dtype=pl.Struct,
        )
        .alias("intersect")
    ).unnest("intersect")

    logging.info("collecting polars operations")
    # df = df.drop("maintainers")
    df = df.collect()
    print(df.head())
    print(df.columns)

    df = df.sort("committer_date", descending=False)
    df.write_parquet("../data/enhanced.parquet")

    # transform to rows by date
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

    df.write_parquet("../data/rows_by_date.parquet")


if __name__ == "__main__":
    run()
