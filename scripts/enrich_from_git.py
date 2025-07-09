import logging
import subprocess
import csv
import orjson
import os
import re
from datetime import timedelta, datetime

from pygit2 import Repository

kernel_path = os.getenv("KERNEL_PATH", ".")

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
        # remove author and committer duplicate
        if (
            attr.get("email")
            and attr["email"] != author.email
            and attr["email"] != committer.email
        ):
            new_attrs_block.append(attr)
    return orjson.dumps(new_attrs_block).decode()


def read_tags(repo: Repository) -> list[[str]]:
    tags_result = subprocess.run(
        ["git", "show-ref", "--tags", "-d"],
        cwd=repo.workdir,
        capture_output=True,
        text=True,
    )
    if tags_result.returncode != 0:
        logging.error(tags_result.stderr)
        return
    tags = tags_result.stdout.strip().split("\n")
    tags.reverse()
    tag_list = []

    # the desired tags are in this formats: v6.9^{}" or v6.9
    regex = re.compile(r"v(\d+(?:\.\d+)*)(\^{})?")

    for tag_line in tags:
        sha, tag = tag_line.split(" ")
        tag_version = ""

        # ignore release candidate tags
        if "-rc" not in tag:
            match = regex.search(tag)
            if match:
                try:
                    commit = repo.get(sha)
                    commit_time = None
                    try:
                        commit_time = datetime.fromtimestamp(commit.commit_time)
                        (+timedelta(minutes=commit.commit_time_offset),)
                    except Exception as e:
                        logging.info(
                            f"{sha} git object is probably not a commit: %s", e
                        )
                    tag_version = match.group(1)
                    tag_list.append(
                        [
                            tag_version,
                            sha,
                            commit_time,
                        ]
                    )
                except Exception as e:
                    logging.error(e)
                    pass

    return tag_list


def write_tags_file(tags: list[[str]]):
    tags_file = open("./data/tags.csv", "w", newline="", buffering=1, encoding="utf-8")
    tags_writer = csv.writer(
        tags_file, delimiter="|", quoting=csv.QUOTE_ALL, lineterminator="\n"
    )

    tags_writer.writerow(["tag", "commit", "date"])

    for tag_line in tags:
        tags_writer.writerow(tag_line)


def run(kernel_path: str):
    INITIAL_COMMIT = "4a2d78822fdf1556dfbbfaedd71182fe5b562194"

    logging.info(f"Reading from kernel located at : {kernel_path}")
    repo = Repository(kernel_path)
    repo.get(INITIAL_COMMIT)

    commits_file = open("./data/commits.csv", "r")
    reader = csv.DictReader(commits_file, delimiter="|")

    file = open("./data/enhanced.csv", "w", newline="", buffering=1, encoding="utf-8")
    writer = csv.writer(file, delimiter="|", quoting=csv.QUOTE_ALL, lineterminator="\n")
    writer.writerow(
        [
            "commit",
            "committer_date",
            "author_date",
            "insertions",
            "deletions",
            "author",
            "committer",
            "attributions",
            "tag",
        ]
    )

    # read all tags from repo
    tags = read_tags(repo)
    # write a tag:commit csv file
    write_tags_file(tags)

    # map commit:tag for reverse lookup
    tag_map = {tagl[1]: tagl[0] for tagl in tags}

    for row in reader:
        commit = repo.get(row["commit"])
        if commit is not None:
            parents = commit.parents

            # merge commits default to 0 (should be accounted by the commits themselves)
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
                    tag_map.get(row["commit"]),
                ]
            )

    file.close()


if __name__ == "__main__":
    run(kernel_path)
