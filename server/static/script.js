async function get_commits(window_size=null){
		if (window_size === null){
			result = await fetch('/api/commits')
		} else{
			result = await fetch(`/api/commits?window_size=${window_size}`)
		}
    json_commits = await result.json()
    
    return json_commits
}

async function getTags(){
    result = await fetch("/api/tags")
    jsonTags = await result.json()
    return jsonTags
}

function getTagsIn(collectedTags, begin,end){

    const selectedTags = []

    for(tag of collectedTags){
        if(tag["date"] == ""){
            continue;
        }
        
        const tagDate = new Date(tag["date"])
        if(tagDate >= begin && tagDate <= end){
            selectedTags.push([tagDate,tag["tag"]])
        }
    }

    return selectedTags
}
// -----------------------------------------------------------------------------------
// Computing Sliding Window Data
// -----------------------------------------------------------------------------------

const DATESAMPLINGINTERVAL = 1//In days, used for plots


const LEFTDATAPOINTS = ["Authors","Committers","Reviewed Bys","Commits","Maintainers Listed","Authoring Maintainers","Supporting Maintainers"];


// Create Vue app after the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = Vue.createApp({
        data() {
            return {
                branchData: {
                    leftDataPoints: ['Authors', 'Committers'],
                    rightDataPoints: ['LoC Net'],
                    allData: {},
                    commitDates: [],
                    tags: [],
                    showTags: false,
                    overRatio: 'LoC Changes',
                    underRatio: 'Committers',
                    showRatio: false
                },
                windowSize: '1',
                collectedCommits: null,
                collectedTags: null,
                resizeTimeout: null,
                isLoading: false
            }
        },
        mounted() {
            // Add resize event listener
            window.addEventListener('resize', this.handleResize);
        },
        beforeUnmount() {
            // Clean up resize event listener
            window.removeEventListener('resize', this.handleResize);
        },
        methods: {
            handleResize() {
								console.log("handleResize");
                // Debounce resize events
                if (this.resizeTimeout) {
                    clearTimeout(this.resizeTimeout);
                }
                this.resizeTimeout = setTimeout(() => {
                    const plotDiv = document.getElementById('plotDiv');
                    if (plotDiv) {
                        Plotly.Plots.resize(plotDiv);
                    }
                }, 250); // 250ms debounce
            },
            replotOnToggle() {
								console.log("replotOnToggle");
                this.plot_figure();
            },
            toggleCustomRatio() {
								console.log("toggleCustomRatio");
                this.plot_figure();
            },
            updateOver() {
								console.log("updateOver");
                this.plot_figure();
            },
            updateUnder() {
								console.log("updateUnder");
                this.plot_figure();
            },
            updateWindowLen() {
								console.log("updateWindowLen");
								this.fetchData();
                // this.computeBranchData().then(() => {
                //     this.plot_figure();
                // });
            },
            async fetchData() {
								console.log("fetchData");
                try {
                    this.isLoading = true;
                    // get commits and tags in parallel
                    const [commits, tags] = await Promise.all([get_commits(this.windowSize), getTags()]);
                    this.collectedTags = tags;
                    this.collectedCommits = commits;
                    await this.computeBranchData();
                    await this.plot_figure();
                } catch (error) {
                    console.error('Error initializing data:', error);
                } finally {
                    this.isLoading = false;
                }
            },
            // /**
            //  * Computes the sliding window data relative to the given list of commits.
            //  * Updates the global variable 'branchData' with the new data.
            //  * @param {*} commitList List of commits from the tree to be analyzed.
            //  */
            async computeBranchData() {
								console.log("computeBranchData");
                if (!this.collectedCommits) {
                    console.error('Commits not initialized');
                    return;
                }

								console.log(this.collectedCommits)

                const allData = {
                    'Authors': {'axisLabel': 'Contributions', 'data': this.collectedCommits["rolling_count_authors"]},
                    'Committers': {'axisLabel': 'Contributions', 'data': this.collectedCommits["rolling_count_committers"]},
                    'Reviewed Bys': {'axisLabel': 'Contributions', 'data': this.collectedCommits["attributions_reviewed"]},
                    'Authoring Maintainers': {'axisLabel': 'Contributions', 'data': this.collectedCommits["attributions_reviewed"]},
                    'Supporting Maintainers': {'axisLabel': 'Contributions', 'data': this.collectedCommits["attributions_reviewed"]},
                    'Maintainers Listed': {'axisLabel': 'Contributions', 'data': this.collectedCommits["declared_maintainers"]},
                    'LoC Added': {'axisLabel': 'LoC', 'data': this.collectedCommits["insertions"]},
                    'LoC Removed': {'axisLabel': 'LoC', 'data': this.collectedCommits["deletions"]},
                    'LoC Net': {'axisLabel': 'LoC', 'data': this.collectedCommits["net_line_change"]},
                    'LoC Changes': {'axisLabel': 'LoC', 'data': this.collectedCommits["total_line_change"]},
                    'Commits': {'axisLabel': 'Contributions', 'data': this.collectedCommits["number_of_commits"]}
                };

								// initialize branchData
                if(Object.keys(this.branchData.allData).length === 0) {
                    const dates = this.collectedCommits["committer_date"];
                    
                    this.branchData = {
                        leftDataPoints: ['Authors','Committers'],
                        rightDataPoints: ['LoC Net'],
                        allData: allData,
                        commitDates: dates,
                        tags: getTagsIn(this.collectedTags, dates[0], dates[dates.length-1]),
                        showTags: false,
                        overRatio: 'LoC Changes',
                        underRatio: 'Committers',
                        showRatio: false
                    };
                } else {
                    this.branchData.allData = allData;
                }
								console.log("branchData", this.branchData.allData);
            },
            async plot_figure() {
							  console.log("plot_figure");
                this.isLoading = true;
                try {
                    const plotDiv = document.getElementById('plotDiv');
                    if (!plotDiv) {
                        console.error('Plot div not found');
                        return;
                    }

                    const xData = this.branchData.commitDates;
                    if (!xData || xData.length === 0) {
                        console.error('No data available for plotting');
                        return;
                    }

                    const dummyTrace = {
                        x: [null],
                        y: [null],
                        type: 'scatter',
                        mode: 'lines',
                        yaxis: 'y',
                        showlegend: false,
                        hoverinfo: 'none',
                        visible: true
                    }

                    var data = [];

                    let leftAxisLabel;
                    let rightAxisLabel;

                    for(const leftKey of this.branchData.leftDataPoints) {
                        if (!this.branchData.allData[leftKey]) {
                            console.warn(`No data available for ${leftKey}`);
                            continue;
                        }
                        data.push({
                            x: xData,
                            y: this.branchData.allData[leftKey]['data'],
                            type: 'lines',
                            yaxis: 'y',
                            name: leftKey
                        })
                        leftAxisLabel = this.branchData.allData[leftKey]['axisLabel'];
                    }

                    if(this.branchData.leftDataPoints.length === 0) {
                        data.push(dummyTrace);
                    }
                    
                    for(const rightKey of this.branchData.rightDataPoints) {
                        if (!this.branchData.allData[rightKey]) {
                            console.warn(`No data available for ${rightKey}`);
                            continue;
                        }
                        data.push({
                            x: xData,
                            y: this.branchData.allData[rightKey]['data'],
                            type: 'lines',
                            yaxis: 'y2',
                            name: rightKey
                        })
                        rightAxisLabel = this.branchData.allData[rightKey]['axisLabel'];
                    }

                    const tagShapes = []
                    const tagLabels = []

                    if(this.branchData.showTags) {
                        for(const datedTag of this.branchData.tags) {
                            const tagDate = datedTag[0];
                            
                            const newShape = {
                                type: 'line',
                                x0: tagDate,
                                x1: tagDate,
                                y0: 0,
                                y1: 1,
                                xref: 'x',
                                yref: 'paper',
                                line: {color: 'skyBlue', width: 2, dash: 'dot' }
                            };

                            const newLabel = {
                                type: 'line',
                                x: tagDate,
                                y: 1.05,
                                xref: 'x',
                                yref: 'paper',
                                text: datedTag[1],
                                showarrow: false,
                                xanchor: 'center',
                                yanchor: 'bottom',
                                line: {color: 'skyBlue', width: 2, dash: 'dot' }
                            }

                            tagShapes.push(newShape);
                            tagLabels.push(newLabel);
                        }
                    }

                    if(this.branchData.showRatio) {
                        const ratioValues = [];
                        const overKey = this.branchData.overRatio;
                        const underKey = this.branchData.underRatio;
                        
                        if (!this.branchData.allData[overKey] || !this.branchData.allData[underKey]) {
                            console.warn('Missing data for ratio calculation');
                        } else {
                            for(let i in xData) {
                                const overVal = this.branchData.allData[overKey]['data'][i];
                                const underVal = this.branchData.allData[underKey]['data'][i];

                                if(underVal == 0) {
                                    if(i > 0) {
                                        ratioValues.push(ratioValues[i-1]);
                                    } else {
                                        ratioValues.push(0);
                                    }
                                } else {
                                    ratioValues.push(overVal/underVal);
                                }
                            }

                            data.push({
                                x: xData,
                                y: ratioValues,
                                type: 'lines',
                                yaxis: 'y3',
                                line: { color: 'red', width: 2, dash: 'dot' },
                                name: "Ratio " + overKey + " over " + underKey
                            })
                        }
                    }

                    var layout = {
                        xaxis: {
                            title: 'Date',
                            type: 'date'
                        },
                        yaxis: {
                            title: leftAxisLabel
                        },
                        yaxis2: {
                            title: rightAxisLabel,
                            overlaying: 'y',
                            side: 'right',
                            anchor: 'x',
                            showgrid: false,
                        },
                        yaxis3: {
                            overlaying: 'y',
                            side: 'left',
                            rangemode: 'tozero',
                            anchor: 'x',
                            zeroline: false,
                            showgrid: false,
                            showticklabels: false
                        },
                        shapes: tagShapes,
                        annotations: tagLabels
                    };

                    await Plotly.newPlot('plotDiv', data, layout);
                } catch (error) {
                    console.error('Error plotting figure:', error);
                } finally {
                    this.isLoading = false;
                }
            }
        }
    });

    // Mount Vue app
    const vm = app.mount('#app');

		// Wait for next tick to ensure DOM is ready
		// await this.$nextTick();
    // Initialize data
    vm.fetchData();
});
