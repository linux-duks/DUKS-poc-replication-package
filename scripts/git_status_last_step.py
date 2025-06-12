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


def run(kernel_path: str):
    # data = open("../data/enhanced.csv").read()
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


if __name__ == "__main__":
    kernel_path = os.getenv("KERNEL_PATH", ".")
    run(kernel_path)
