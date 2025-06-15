async function get_commits(window_size=null){
		if (window_size === null){
			result = await fetch('/api/commits')
		} else{
			result = await fetch(`/api/commits?window_size=${window_size}`)
		}
    json_commits = await result.json()
    
    return json_commits
}

async function getTagsIn(begin,end){
    result = await fetch("/api/tags")
    jsonTags = await result.json()
    
    const selectedTags = []

    for(tag of jsonTags){
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

/**
 * Computes the sum of the LoC differences for a sliding window.
 * @param {*} commits 
 * @param {number} intervalLengthDays 
 * @returns [commit_dates, summed_pos_diffs, summed_neg_diffs, net_diff, summed_total_diffs, tag_dates]
 */
function slidingWindowDiffs(commits, intervalLengthDays){

    const FIRSTCOMMITDATE = new Date(commits[0]["committer_date"])
    FIRSTCOMMITDATE.setDate(FIRSTCOMMITDATE.getDate() + intervalLengthDays + 1);
    const LASTCOMMITDATE = new Date(commits[commits.length-1]["committer_date"]);

    let running_minus = 0;
    let running_plus = 0;
    let running_acc = 0;
    let running_changes = 0;
    let running_no_commits = 0;

    let window_begin = 0;
    let window_end = -1;

    date_points = []
    plus_points = []
    minus_points = []
    acc_points = []
    modification_points = []
    no_commits = []
    declared_maintainers = []

    let thisDate = FIRSTCOMMITDATE;
    while(thisDate < LASTCOMMITDATE){
        
        const maxDate = new Date(thisDate).setDate(thisDate.getDate() + 1);
        const minDate = new Date(thisDate).setDate(thisDate.getDate() - intervalLengthDays);

        // First, update the datetime window. Starting with the last commit of the window
        while(window_end < commits.length - 1 && maxDate >= new Date(commits[window_end+1]["committer_date"])){
            window_end+=1
            let new_plus = commits[window_end]["insertions"]
            let new_minus = commits[window_end]["deletions"]
            running_plus += new_plus
            running_minus += new_minus
            running_acc += new_plus - new_minus
            running_changes += new_plus + new_minus

            if(commits[window_end]["number_of_commits"]){
                running_no_commits += commits[window_end]["number_of_commits"]
            }

            declared_maintainers.push(commits[window_end]["declared_maintainers"])

        }

        //Update window beginning
        while(minDate > new Date(commits[window_begin]["committer_date"])){
            window_begin += 1
            let old_plus = commits[window_begin]["insertions"]
            let old_minus = commits[window_begin]["deletions"]
            running_plus -= old_plus
            running_minus -= old_minus
            running_acc -= old_plus - old_minus
            running_changes -= old_plus + old_minus
            if(commits[window_begin]["number_of_commits"]){
                running_no_commits -= commits[window_begin]["number_of_commits"]
            }
        }

        date_points.push(thisDate);
        plus_points.push(running_plus);
        minus_points.push(running_minus);
        acc_points.push(running_acc);//Math.abs(running_acc));
        modification_points.push(running_changes);
        no_commits.push(running_no_commits);

        thisDate.setDate(thisDate.getDate()+DATESAMPLINGINTERVAL);

    }

    return [date_points, plus_points, minus_points, acc_points,modification_points,no_commits,declared_maintainers]
}

function slidingWindowAuthors(commits, intervalLengthDays){

    const FIRSTCOMMITDATE = new Date(commits[0]["committer_date"])
    FIRSTCOMMITDATE.setDate(FIRSTCOMMITDATE.getDate() + intervalLengthDays + 1);
    const LASTCOMMITDATE = new Date(commits[commits.length-1]["committer_date"]);

    let runningAuthors = {};
    let runningCommitters = {};
    let runningAttributions = {};

    let runningMaintAuthors = {};
    let runningMaintExtras = [];

    let window_begin = 0;
    let window_end = -1;

    date_points = []
    num_authors = []
    num_committers = []

    num_maint_authors = []
    num_maint_extras = []

    let noCommits = 0
    let thisDate = FIRSTCOMMITDATE;
    while(thisDate < LASTCOMMITDATE){
        
        const maxDate = new Date(thisDate).setDate(thisDate.getDate() + 1);
        const minDate = new Date(thisDate).setDate(thisDate.getDate() - intervalLengthDays);

        // First, update the datetime window. Starting with the last commit of the window
        while(window_end < commits.length - 1 && maxDate >= new Date(commits[window_end+1]["committer_date"])){
            window_end+=1

            if(commits[window_end]["author"]){
                for(thisAuthor of commits[window_end]["author"]){
                    if (thisAuthor in runningAuthors){
                        runningAuthors[thisAuthor] = runningAuthors[thisAuthor] + 1;
                    }else{
                        runningAuthors[thisAuthor] = 1;
                    }
                }
            }

            
            if(commits[window_end]["committer"]){
                for(thisCommitter of commits[window_end]["committer"]){
                    if (thisCommitter in runningCommitters){
                        runningCommitters[thisCommitter] = runningCommitters[thisCommitter] + 1;
                    }else{
                        runningCommitters[thisCommitter] = 1
                    }
                }
            }

            for(thisAuthor of commits[window_end]["author_in_maintainers_file"]){
                if (thisAuthor in runningMaintAuthors){
                    runningMaintAuthors[thisAuthor] = runningMaintAuthors[thisAuthor] + 1;
                }else{
                    runningMaintAuthors[thisAuthor] = 1;
                }
            }
            
            const extraMaintainers = commits[window_end]["committer_in_maintainers_file"].concat(commits[window_end]["extra_attributions_in_maintainers_file"])

            for(thisMaint of extraMaintainers){
                if (thisMaint in runningMaintExtras){
                    runningMaintExtras[thisMaint] = runningMaintExtras[thisMaint] + 1;
                }else{
                    runningMaintExtras[thisMaint] = 1;
                }
            }

            const thisAttributions = commits[window_end]["attributions"];
            for(attribution of thisAttributions){
                const attrType = attribution["type"].toLowerCase();
                const attrEmail = attribution["email"];

                if(attrType in runningAttributions){
                    if(attrEmail in runningAttributions[attrType]['runningAuthors']){
                        runningAttributions[attrType]['runningAuthors'][attrEmail]+= 1;
                    }else{
                        runningAttributions[attrType]['runningAuthors'][attrEmail] = 1;
                    }
                }else{
                    const newRunningAuthors = {}
                    newRunningAuthors[attrEmail] = 1
                    runningAttributions[attrType] = {
                        'runningCount' : Array(noCommits).fill(0),
                        'runningAuthors' : newRunningAuthors
                    }
                }
            }

            noCommits+=1
        }

        //Update window beginning
        while(minDate > new Date(commits[window_begin]["committer_date"])){
            window_begin += 1

            if(commits[window_begin]["author"]){
                for(thisAuthor of commits[window_begin]["author"]){
                    if (runningAuthors[thisAuthor] <= 1){
                        delete runningAuthors[thisAuthor];
                    }else{
                        runningAuthors[thisAuthor] = runningAuthors[thisAuthor] - 1;
                    }
                }
            }

            if(commits[window_begin]["committer"]){
                for(thisCommitter of commits[window_begin]["committer"]){
                    if (runningCommitters[thisCommitter] <= 1){
                        delete runningCommitters[thisCommitter]
                    }else{
                        runningCommitters[thisCommitter] = runningCommitters[thisCommitter] - 1;
                    }
                }
            }

            for(thisAuthor of commits[window_begin]["author_in_maintainers_file"]){
                if (runningMaintAuthors[thisAuthor] <= 1){
                    delete runningMaintAuthors[thisAuthor]
                }else{
                    runningMaintAuthors[thisAuthor] = runningMaintAuthors[thisAuthor] - 1;
                }
            }
            
            const extraMaintainers = commits[window_begin]["committer_in_maintainers_file"].concat(commits[window_begin]["extra_attributions_in_maintainers_file"])

            for(thisMaint of extraMaintainers){
                if (runningMaintExtras[thisMaint] <= 1){
                    delete runningMaintExtras[thisMaint];
                }else{
                    runningMaintExtras[thisMaint] = runningMaintExtras[thisMaint] + 1;
                }
            }

            const thisAttributions = commits[window_begin]["attributions"];
            for(attribution of thisAttributions){
                const attrType = attribution["type"].toLowerCase();
                const attrEmail = attribution["email"];
                if(runningAttributions[attrType]['runningAuthors'][attrEmail] <= 1){
                    delete runningAttributions[attrType]['runningAuthors'][attrEmail]
                }else{
                    runningAttributions[attrType]['runningAuthors'][attrEmail] -= 1;
                }
            }
        }

        date_points.push(new Date(thisDate));
        num_authors.push(Object.keys(runningAuthors).length);
        num_committers.push(Object.keys(runningCommitters).length);
        num_maint_authors.push(Object.keys(runningMaintAuthors).length);
        num_maint_extras.push(Object.keys(runningMaintExtras).length);
        
        for(attrTypeDict of Object.values(runningAttributions)){
            attrTypeDict['runningCount'].push(Object.keys(attrTypeDict['runningAuthors']).length)
        }

        thisDate.setDate(thisDate.getDate()+DATESAMPLINGINTERVAL);

    }

    return [date_points, num_authors ,num_committers, runningAttributions,num_maint_authors,num_maint_extras]
}

// -----------------------------------------------------------------------------------
// Load Initial Data
// -----------------------------------------------------------------------------------

var collectedCommits;

// Nothing like a good and old global variable
var branchData = {
    'leftDataPoints': [], // keys from 'allData dict' shown in the left y axis
    'rightDataPoints' :[], // keys from 'allData dict' shown in the right y axis
    'chosenData' : [], // keys from 'allData dict'
    'allData': [], // dict{'<title>' : dict {'axisLabel': '', 'data': [] } } 
    'commitDates': [], // xAxis for all traces
    'tags' : [],
    'showTags' : false,
}

function setBranchData(newBranchData){
    branchData = newBranchData;
}

function getBranchData(){
    return branchData;
}

const LEFTDATAPOINTS = ["Authors","Committers","Reviewed Bys","Commits","Maintainers Listed","Authoring Maintainers","Supporting Maintainers"];

/**
 * Computes the sliding window data relative to the given list of commits.
 * Updates the global variable 'branchData' with the new data.
 * @param {*} commitList List of commits from the tree to be analyzed.
 */
async function computeBranchData(windowRadius=14){

    const commits = collectedCommits

    const contribs_results = slidingWindowAuthors(commits,windowRadius)
    const diffs_results = slidingWindowDiffs(commits,windowRadius)

    const attribData = contribs_results[3];
    const allData = {
        'Authors' : {'axisLabel': 'Contributions', 'data': contribs_results[1]},
        'Committers' : {'axisLabel': 'Contributions', 'data': contribs_results[2]},
        'Reviewed Bys' : {'axisLabel': 'Contributions', 'data': attribData["reviewed-by"]["runningCount"]},
        'Authoring Maintainers' : {'axisLabel': 'Contributions', 'data': contribs_results[4]},
        'Supporting Maintainers' : {'axisLabel': 'Contributions', 'data': contribs_results[5]},
        'Maintainers Listed' : {'axisLabel': 'Contributions', 'data': diffs_results[6]},
        'LoC Added' : {'axisLabel': 'LoC', 'data': diffs_results[1]},
        'LoC Removed' : {'axisLabel': 'LoC', 'data': diffs_results[2]},
        'LoC Net' : {'axisLabel': 'LoC', 'data': diffs_results[3]},
        'LoC Changes' :  {'axisLabel': 'LoC', 'data': diffs_results[4]},
        'Commits' : {'axisLabel': 'Contributions', 'data': diffs_results[5]}
    }

    const oldBranchData = getBranchData();

    if(oldBranchData.allData.length == 0){

        const dates = contribs_results[0];
        const tags = await getTagsIn(dates[0],dates[dates.length-1]);

        const newBranchData = {
            'leftDataPoints': ['Authors','Committers'],
            'rightDataPoints':  ['LoC Net'],
            'allData': allData,
            'commitDates': dates,
            'tags' : tags,
            'showTags' : false,
            'overRatio' : 'LoC Changes',
            'underRatio' : 'Committers',
            'showRatio' : false
        };
        setBranchData(newBranchData);
    }else{
        oldBranchData["allData"] = allData
    }

    
    plot_figure();
}

function plot_figure(){

    const branchData = getBranchData()

    const xData = branchData['commitDates'];

    const dummyTrace = {
        x: [null], // Or any valid x-value, but make y null or empty
        y: [null], // No data to display
        type: 'scatter',
        mode: 'lines', // Can be 'lines', 'markers', or 'none'
        yaxis: 'y',
        showlegend: false, // Don't show this dummy trace in the legend
        hoverinfo: 'none', // Don't show hover info for this trace
        visible: true // Ensure the trace is considered for layout calculations
    }

    var data = [];

    let leftAxisLabel; // I'm supposing these labels don't change
    let rightAxisLabel;

    for(leftKey of branchData['leftDataPoints']){
        data.push({
            x: xData,
            y: branchData['allData'][leftKey]['data'],
            type: 'lines',
            yaxis: 'y',
            name: leftKey
        })
        leftAxisLabel = branchData['allData'][leftKey]['axisLabel'];
    }

    if(branchData["leftDataPoints"].length == 0){
        data.push(dummyTrace);
    }
    
    for(rightKey of branchData['rightDataPoints']){
        data.push({
            x: xData,
            y: branchData['allData'][rightKey]['data'],
            type: 'lines',
            yaxis: 'y2',
            name: rightKey
        })
        rightAxisLabel = branchData['allData'][rightKey]['axisLabel'];
    }

    const tagShapes = []
    const tagLabels = []

    if(branchData["showTags"]){
        for(datedTag of branchData["tags"]){
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

    if(branchData["showRatio"]){
        const ratioValues = [];
        const overKey = branchData['overRatio'];
        const underKey = branchData['underRatio'];
        for(i in xData){
            const overVal = branchData['allData'][overKey]['data'][i];
            const underVal = branchData['allData'][underKey]['data'][i];

            if(underVal == 0){
                if(i > 0){
                    ratioValues.push(ratioValues[i-1]);
                }else{
                    ratioValues.push(0);
                }
            }else{
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

    Plotly.newPlot('plotDiv', data, layout);

}


/**
 * Parses the 'attributions' field of every commit object of a list
 * into a json object.
 * @param {*} commits 
 * @returns commits
 */
function loadExtraAttributions(commits){
    for(commit of commits){
        commit["attributions"] = JSON.parse(commit["attributions"]);
    }
    return commits
}

/**
 * Replots the graph once a given input is toggled.
 * @param {*} toggledInputElem 
 */
function replotOnToggle(toggledInputElem){

    const checked = toggledInputElem.checked;
    const dataPoints = getBranchData();
    const titleValue = toggledInputElem.name.slice(5).replace("_"," ");  

    if(titleValue === "Tags"){
        dataPoints["showTags"] = checked;
        plot_figure()
        return
    }

    if(LEFTDATAPOINTS.includes(titleValue)){
        if(checked){
            if(dataPoints["leftDataPoints"].includes(titleValue)){
                return;
            }
            dataPoints["leftDataPoints"].push(titleValue);
        }else if(dataPoints["leftDataPoints"].includes(titleValue)){
            dataPoints["leftDataPoints"].splice(dataPoints["leftDataPoints"].indexOf(titleValue),1);
        }
    }else{
        if(checked){
            if(dataPoints["rightDataPoints"].includes(titleValue)){
                return;
            }
            dataPoints["rightDataPoints"].push(titleValue);
        }else if(dataPoints["rightDataPoints"].includes(titleValue)){
            dataPoints["rightDataPoints"].splice(dataPoints["rightDataPoints"].indexOf(titleValue),1);
        }
    }

    plot_figure()

}

function toggleCustomRatio(){
    const checked = document.getElementById("checkCustom").checked
    const ratioDiv = document.getElementById("customRatioArea")

    getBranchData()["showRatio"] = checked

    if(checked){
        ratioDiv.style.display = "block";
    }else{
        ratioDiv.style.display = "none";
    }

    plot_figure();
}

function updateOver(component){
    const chosen = component.selectedOptions[0].value;
    getBranchData()["overRatio"] = chosen;
    plot_figure();
}

function updateUnder(component){
    const chosen = component.selectedOptions[0].value;
    getBranchData()["underRatio"] = chosen;
    plot_figure();
}

function updateWindowLen(component){

    const nextWindow = parseInt(component.selectedOptions[0].id.slice(6))

   computeBranchData(nextWindow).then(
    () => {plot_figure()}
   )
}

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
                windowSize: '14',
                collectedCommits: null,
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
                this.plot_figure();
            },
            toggleCustomRatio() {
                this.plot_figure();
            },
            updateOver() {
                this.plot_figure();
            },
            updateUnder() {
                this.plot_figure();
            },
            updateWindowLen() {
                this.computeBranchData(parseInt(this.windowSize)).then(() => {
                    this.plot_figure();
                });
            },
            async initializeData() {
                try {
                    this.isLoading = true;
                    const commits = await get_commits();
                    this.collectedCommits = loadExtraAttributions(commits);
                    await this.computeBranchData();
                    await this.plot_figure();
                } catch (error) {
                    console.error('Error initializing data:', error);
                } finally {
                    this.isLoading = false;
                }
            },
            async computeBranchData(windowRadius=14) {
                if (!this.collectedCommits) {
                    console.error('Commits not initialized');
                    return;
                }

                const contribs_results = slidingWindowAuthors(this.collectedCommits, windowRadius);
                const diffs_results = slidingWindowDiffs(this.collectedCommits, windowRadius);

                const attribData = contribs_results[3];
                const allData = {
                    'Authors': {'axisLabel': 'Contributions', 'data': contribs_results[1]},
                    'Committers': {'axisLabel': 'Contributions', 'data': contribs_results[2]},
                    'Reviewed Bys': {'axisLabel': 'Contributions', 'data': attribData["reviewed-by"]["runningCount"]},
                    'Authoring Maintainers': {'axisLabel': 'Contributions', 'data': contribs_results[4]},
                    'Supporting Maintainers': {'axisLabel': 'Contributions', 'data': contribs_results[5]},
                    'Maintainers Listed': {'axisLabel': 'Contributions', 'data': diffs_results[6]},
                    'LoC Added': {'axisLabel': 'LoC', 'data': diffs_results[1]},
                    'LoC Removed': {'axisLabel': 'LoC', 'data': diffs_results[2]},
                    'LoC Net': {'axisLabel': 'LoC', 'data': diffs_results[3]},
                    'LoC Changes': {'axisLabel': 'LoC', 'data': diffs_results[4]},
                    'Commits': {'axisLabel': 'Contributions', 'data': diffs_results[5]}
                };

                if(Object.keys(this.branchData.allData).length === 0) {
                    const dates = contribs_results[0];
                    const tags = await getTagsIn(dates[0], dates[dates.length-1]);

                    this.branchData = {
                        leftDataPoints: ['Authors','Committers'],
                        rightDataPoints: ['LoC Net'],
                        allData: allData,
                        commitDates: dates,
                        tags: tags,
                        showTags: false,
                        overRatio: 'LoC Changes',
                        underRatio: 'Committers',
                        showRatio: false
                    };
                } else {
                    this.branchData.allData = allData;
                }
            },
            async plot_figure() {
                this.isLoading = true;
                // Wait for next tick to ensure DOM is ready
                await this.$nextTick();
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

    // Initialize data
    vm.initializeData();
});
