import logging
import os
import re
import csv
from datetime import datetime, timedelta

import orjson
import grpc
import swh.graph.grpc.swhgraph_pb2 as swhgraph
import swh.graph.grpc.swhgraph_pb2_grpc as swhgraph_grpc
# from google.protobuf.field_mask_pb2 import FieldMask

GRAPH_GRPC_SERVER = "0.0.0.0:50091"
LIMIT = 0

INITIAL_NODE = "swh:1:rev:4a2d78822fdf1556dfbbfaedd71182fe5b562194"

DEBUG = os.getenv("DEBUG", "false")
level = logging.INFO
if DEBUG != "false":
    level = logging.DEBUG

logging.basicConfig(
    level=level,
    format="[%(asctime)s] {%(pathname)s:%(lineno)d} %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)


def extract_attributions(commit_message) -> (list[dict], list[str]):
    """
    Parses a git commit message and extracts all personal attributions.

    Args:
        commit_message (str): The full git commit message.

    Returns:
        list: A list of dictionaries, where each dictionary contains
              'type' (e.g., 'Signed-off-by'), 'name', and 'email' for each attribution found.
    """
    attributions = []
    # This regex looks for lines starting with "Word-by:"
    # followed by a name (can contain various characters), and then an email in angle brackets.
    # It captures the "Word-by" type, the name, and the email separately.
    # The pattern is compiled with MULTILINE to match '^' at the start of each line,
    # and IGNORECASE to match "Signed-off-by", "signed-off-by", etc.
    pattern = re.compile(
        r"^(?P<type>[a-zA-Z\-]+-by):\s*(?P<name>[^<]+?)\s*<(?P<email>[^>]+)>",
        re.MULTILINE | re.IGNORECASE,
    )

    # Use finditer to get all non-overlapping matches
    for match in pattern.finditer(commit_message):
        attributions.append(
            {
                "type": match.group(
                    "type"
                ).strip(),  # Extract the attribution type (e.g., 'Signed-off-by')
                "name": match.group(
                    "name"
                ).strip(),  # Extract the name (e.g., 'Author Name')
                "email": match.group(
                    "email"
                ).strip(),  # Extract the email (e.g., 'author.name@email.com')
            }
        )
    return attributions


# def extract_links(commit_message):
#     """
#     Parses a git commit message and extracts all URLs (links).
#
#     Args:
#         commit_message (str): The full git commit message.
#
#     Returns:
#         list: A list of strings, where each string is a URL found in the message.
#     """
#     links = []
#     # This regex looks for common URL patterns starting with http or https.
#     # It captures the full URL.
#     # The pattern is non-greedy to avoid capturing too much if multiple links are on a line.
#     pattern = re.compile(
#         r"https?://[^\s<>\"'{}|\\^`[\]]+",
#         re.IGNORECASE
#     )
#
#     # Use findall to get all non-overlapping matches as a list of strings
#     links = pattern.findall(commit_message)
#     return links

with grpc.insecure_channel(GRAPH_GRPC_SERVER) as channel:
    stub = swhgraph_grpc.TraversalServiceStub(channel)

    node_num = 0
    visited = set()
    queue = [INITIAL_NODE]

    file = open("file.csv", "w", newline="", buffering=1, encoding="utf-8")
    writer = csv.writer(file, delimiter="|", quoting=csv.QUOTE_ALL, lineterminator="\n")
    writer.writerow(
        [
            "commit",
            "parents",
            "committer_date",
            "author_date",
            "attributions",
            # "diff_plus",
            # "diff_minus",
        ]
    )

    logging.info(f"Preparing with {queue}")
    while True:
        try:
            next_node = queue.pop(0)
            logging.info(f"Visiting {next_node}")
            response = stub.GetNode(
                swhgraph.GetNodeRequest(
                    swhid=next_node,
                    # mask=FieldMask(paths=["swhid", "rev.message", "rev.author"]),
                )
            )
            node_num += 1
            visited.add(next_node)

            local_successors = []
            for succ in response.successor:
                succ_swhid = succ.swhid
                # filter only revisions
                if succ_swhid.startswith("swh:1:rev") and succ_swhid not in visited:
                    queue.append(succ_swhid)
                    local_successors.append(succ_swhid.lstrip("swh:1:rev"))
                # else:
                #     print("READING NODE", succ)
                #     dir_response = stub.GetNode(
                #         swhgraph.GetNodeRequest(
                #             swhid=succ_swhid,
                #             # mask=FieldMask(paths=["swhid", "rev.message", "rev.author"]),
                #         )
                #     )
                #     print(dir_response)

            attributions = extract_attributions(str(response.rev.message.decode()))
            # TODO: on an non-anonimized graph, retrive the authors correctly
            if len(attributions) < 2:
                attributions.append({"type": "author", "name": response.rev.author})
                attributions.append(
                    {"type": "committer", "name": response.rev.committer}
                )

            writer.writerow(
                [
                    response.swhid.lstrip("swh:1:rev:"),  # commit sha1
                    orjson.dumps(local_successors).decode(),  # parents
                    (
                        datetime.utcfromtimestamp(response.rev.committer_date)
                        + timedelta(minutes=response.rev.committer_date_offset)
                    ).strftime("%Y-%m-%dT%H:%M:%S"),  # committer_date
                    (
                        datetime.utcfromtimestamp(response.rev.author_date)
                        + timedelta(minutes=response.rev.author_date_offset)
                    ).strftime("%Y-%m-%dT%H:%M:%S"),  # author_date
                    orjson.dumps(
                        attributions
                    ).decode(),  # attributions: dict with authors, acks, reviews...
                    # 0,
                    # 0,
                ]
            )
            logging.debug(response)
        except Exception as e:
            logging.error(e)
            break

        if node_num > LIMIT and LIMIT > 0:
            break
    file.close()
