import polars as pl
import orjson


# reads a list of dicts, and returns a list of unique emails
def unique_extra_contributors(attributions: list[dict]) -> int | None:
    attributions = orjson.loads(attributions)
    if not attributions or len(attributions) == 0:
        return None
    return list(set([attr["email"] for attr in attributions]))


def load_data():
    commits_df = pl.read_csv(
        "../data/enhanced.csv", separator="|", try_parse_dates=True
    ).lazy()

    # add column with unique contributors in commit
    commits_df = commits_df.with_columns(
        [
            pl.col("attributions")
            .map_elements(unique_extra_contributors)
            .alias("extra_contributors")
        ]
    )

    # counts extra contributors in commit
    commits_df = commits_df.with_columns(
        pl.col("extra_contributors").list.len().alias("num_extra_contributors"),
    )

    commits_df = commits_df.sort(
        "committer_date", descending=False, maintain_order=True
    )

    return commits_df.collect()


def load_tags():
    df = pl.read_csv(
        "../data/tags.csv",
        separator="|",
    )

    # TODO: change order ?
    # commits_df = commits_df.sort(
    #     "tag", descending=False, maintain_order=True
    # )

    return df


# main used only to test locally, executing this script directly
if __name__ == "__main__":
    print()
    data = load_data()
    print(data.head())
    # print(data.head().to_dicts())
