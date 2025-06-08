import logging
from pygit2 import Repository
import csv
from io import StringIO
import orjson
import os

DEBUG = os.getenv("DEBUG", "false")
level = logging.INFO
if DEBUG != "false":
    level = logging.DEBUG

logging.basicConfig(
    level=level,
    format="[%(asctime)s] {%(pathname)s:%(lineno)d} %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)


def fix_attributions(attributions, author, committer):
    attrs = orjson.loads(attributions)
    new_attrs_block = []

    for attr in attrs:
        # remove author and committer dupplicate
        if (
            attr.get("email")
            and attr["email"] != author.email
            and attr["email"] != committer.email
        ):
            new_attrs_block.append(attr)
    return orjson.dumps(new_attrs_block).decode()


def run(kernel_path: str):
    INITIAL_COMMIT = "4a2d78822fdf1556dfbbfaedd71182fe5b562194"

    logging.info(f"Reading from kernel located at : {kernel_path}")
    repo = Repository(kernel_path)
    repo.get(INITIAL_COMMIT)

    data = open("../data/commits.csv").read()
    reader = csv.DictReader(StringIO(data), delimiter="|")

    file = open("../data/enhanced.csv", "w", newline="", buffering=1, encoding="utf-8")
    writer = csv.writer(file, delimiter="|", quoting=csv.QUOTE_ALL, lineterminator="\n")
    writer.writerow(
        [
            "commit",
            # "parents",
            "committer_date",
            "author_date",
            "insertions",
            "deletions",
            "author",
            "committer",
            "attributions",
        ]
    )

    for row in reader:
        commit = repo.get(row["commit"])
        if commit is not None:
            parents = commit.parents

            # merge commits default to 0 (should be accounted by the commits themselfs)
            insertions = 0
            deletions = 0

            # more than one parent indicates a merge commit
            if len(parents) == 1:
                parent = parents[0]
                if parent is not None:
                    diff = repo.diff(commit.id, parent.id)
                    insertions = diff.stats.insertions
                    deletions = diff.stats.deletions

            writer.writerow(
                [
                    row["commit"],
                    # row["parents"],
                    row["committer_date"],
                    row["author_date"],
                    insertions,
                    deletions,
                    commit.author.email,
                    commit.committer.email,
                    fix_attributions(
                        row["attributions"], commit.author, commit.committer
                    ),
                ]
            )

    file.close()


kernel_path = os.getenv("KERNEL_PATH", ".")
run(kernel_path)
