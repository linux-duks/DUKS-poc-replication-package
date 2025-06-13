import polars as pl


def load_by_commits(window_date_size=None):
    df = pl.read_parquet("../data/by_commit.parquet")

    return df

def load_data(window_date_size=None):
    df = pl.read_parquet("../data/by_date.parquet")

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
