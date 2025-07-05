# 🦆 DUKS - Dashboard for Unified Kernel Statistics

This is a work in progress.
[duks.rcpassos.me](https://duks.rcpassos.me)


## This repository contains the data files, they should be put under the /data folder
The data file is committed with git lfs.
It is also available in the release artifact.

Decompress data :
`$ tar --zstd -xvf data.tar.zst`

Skip to [##Running application]

## Running from zero

Bootstrapping this from zero requires a few external resources.

Requirements:

- Local compressed Software Heritage Graph (at least “History and hosting” graph: 1.4TiB for 2024-12-06) : <https://docs.softwareheritage.org/devel/swh-export/graph/index.html>
- Linux kernel mainline tree
- Software heritage GRPC server: <https://docs.softwareheritage.org/devel/swh-graph/grpc-api.html#starting-the-server>

### Preparing the dataset

1. run the GRPC server with the local graph, following the upstream guide
2. run [scripts/grpc_script.py](scripts/grpc_script.py) to execute the BFS on the graph. Must set the `GRAPH_GRPC_SERVER` and `INITIAL_NODE`
3. run the [scripts/enrich_from_git.py](scripts/enrich_from_git.py) script, pointing to the mainline branch path. This will load data that is unavailable in the graph. (can run in parallel with 4)
4. run the [scripts/get_official_kernel_maintainers.py](scripts/get_official_kernel_maintainers.py) to read the contents of the maintainers file in all its changes.
5. run the [scripts/stitch_data_into_final_payload.py] to get the daily output (with some calculation) and with all files in a single table

### Running application

Run either `podman-compose -f dev-compose.yaml up` for development or `podman-compose up` for production build for production build
