async function get_commits(){
    result = await fetch("commits")
    json_commits = await result.json()
    
    return json_commits
}

async function get_tags(){
    result = await fetch("tags")
    json_tags = await result.json()
    
    return json_tags
}
// -----------------------------------------------------------------------------------
// Computing Sliding Window Data
// -----------------------------------------------------------------------------------

/**
 * Computes the sum of the LoC differences for a sliding window.
 * @param {*} commits 
 * @param {number} intervalLengthDays 
 * @returns [commit_dates, summed_pos_diffs, summed_neg_diffs, summed_total_diffs]
 */
function slidingWindowDiffs(commits, intervalLengthDays){

    let running_minus = commits[0]["deletions"];
    let running_plus = commits[0]["insertions"];
    let running_acc = commits[0]["insertions"] - commits[0]["deletions"];

    let window_begin = 0;
    let window_end = 0;

    date_points = []
    plus_points = []
    minus_points = []
    acc_points = []

    for(i = 0; i < commits.length; i+=1){
        
        let thisDate = new Date(commits[i]["committer_date"])
        const maxDate = new Date(thisDate).setDate(thisDate.getDate() + intervalLengthDays);
        const minDate = new Date(thisDate).setDate(thisDate.getDate() - intervalLengthDays);

        // First, update the datetime window. Starting with the last commit of the window
        while(window_end < commits.length - 1 && maxDate >= new Date(commits[window_end+1]["committer_date"])){
            window_end+=1
            let new_plus = commits[window_end]["insertions"]
            let new_minus = commits[window_end]["deletions"]
            running_plus += new_plus
            running_minus += new_minus
            running_acc += new_plus - new_minus
        }

        //Update window beginning
        while(minDate > new Date(commits[window_begin]["committer_date"])){
            window_begin += 1
            let old_plus = commits[window_begin]["insertions"]
            let old_minus = commits[window_begin]["deletions"]
            running_plus -= old_plus
            running_minus -= old_minus
            running_acc -= old_plus - old_minus
        }

        date_points.push(thisDate);
        plus_points.push(running_plus);
        minus_points.push(running_minus);
        acc_points.push(Math.abs(running_acc));
    }

    return [date_points, plus_points, minus_points, acc_points]
}

function slidingWindowAuthors(commits, intervalLengthDays){

    let runningAuthors = {};
    let runningCommitters = {};

    let window_begin = 0;
    let window_end = 0;

    date_points = []
    num_authors = []
    num_committers = []

    for(i = 0; i < commits.length; i+=1){
        
        let thisDate = new Date(commits[i]["committer_date"])
        const maxDate = new Date(thisDate).setDate(thisDate.getDate() + intervalLengthDays);
        const minDate = new Date(thisDate).setDate(thisDate.getDate() - intervalLengthDays);

        // First, update the datetime window. Starting with the last commit of the window
        while(window_end < commits.length - 1 && maxDate >= new Date(commits[window_end+1]["committer_date"])){
            window_end+=1

            const thisAuthor = commits[window_end]["author"] 
            if (thisAuthor in runningAuthors){
                runningAuthors[thisAuthor] = runningAuthors[thisAuthor] + 1;
            }else{
                runningAuthors[thisAuthor] = 1;
            }

            const thisCommitter = commits[window_end]["committer"];
            if (thisCommitter in runningCommitters){
                runningCommitters[thisCommitter] = runningCommitters[thisCommitter] + 1;
            }else{
                runningCommitters[thisCommitter] = 1
            }
        }

        //Update window beginning
        while(minDate > new Date(commits[window_begin]["committer_date"])){
            window_begin += 1

            const thisAuthor = commits[window_begin]["author"] 
            if (runningAuthors[thisAuthor] <= 1){
                delete runningAuthors[thisAuthor];
            }else{
                runningAuthors[thisAuthor] = runningAuthors[thisAuthor] - 1;
            }

            const thisCommitter = commits[window_begin]["committer"];
            if (runningCommitters[thisCommitter] <= 1){
                delete runningCommitters[thisCommitter]
            }else{
                runningCommitters[thisCommitter] = runningCommitters[thisCommitter] - 1;
            }
        }

        date_points.push(thisDate);
        num_authors.push(Object.keys(runningAuthors).length);
        num_committers.push(Object.keys(runningCommitters).length);
    }

    return [date_points, num_authors ,num_committers]
}

// -----------------------------------------------------------------------------------
// Load Initial Data
// -----------------------------------------------------------------------------------

// Nothing like a good and old global variable
var branchData = {
    'leftDataPoints': [], // keys from 'allData dict' shown in the left y axis
    'rightDataPoints' :[], // keys from 'allData dict' shown in the right y axis
    'chosenData' : [], // keys from 'allData dict'
    'allData': [], // dict{'<title>' : dict {'axisLabel': '', 'data': [] } } 
    'commitDates': [], // xAxis for all traces
}

function setBranchData(newBranchData){
    branchData = newBranchData;
}

function getBranchData(){
    return branchData;
}


/**
 * Computes the sliding window data relative to the given list of commits.
 * Updates the global variable 'branchData' with the new data.
 * @param {*} commitList List of commits from the tree to be analyzed.
 */
function computeBranchData(commitList){

    WINDOW_RADIUS = 10

	  // TODO: use extra attributions
    commits = loadExtraAttributions(commitList)

    const contribs_results = slidingWindowAuthors(commits,WINDOW_RADIUS)
    const diffs_results = slidingWindowDiffs(commits,WINDOW_RADIUS)

    const dates = contribs_results[0];
    const allData = {
        'Authors' : {'axisLabel': 'Contributors', 'data': contribs_results[1]},
        'Commiters' : {'axisLabel': 'Contributors', 'data': contribs_results[2]},
        'LoC Added' : {'axisLabel': 'LoC', 'data': diffs_results[1]},
        'LoC Removed' : {'axisLabel': 'LoC', 'data': diffs_results[2]},
        'LoC Changes' : {'axisLabel': 'LoC', 'data': diffs_results[3]},
    }

    const newBranchData = {
        'leftDataPoints': ['Authors','Commiters'],
        'rightDataPoints':  ['LoC Changes'],
        'allData': allData,
        'commitDates': dates
    };

    setBranchData(newBranchData);
}

function plot_thing(){

    const branchData = getBranchData()

    const xData = branchData['commitDates'];

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

    var layout = {
        title: 'Test plot with Contributor and Diff Data',
        xaxis: {
            title: 'Date'
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
        }
    };


    Plotly.newPlot('plotDiv', data, layout);

}

get_commits().then( (commits) => plot_thing(commits))

/**
 * map_tags loads the tag list and returns a HashMap of TAG to COMMIT
 * returns the map and the array
 * @param {Array.<{tag: String, commit: String}>} tags
 * @returns [{Object.<String, String>}, {Array.<{tag: String, commit: String}>}]
 */
function map_tags(tags){
	var mappedTags = tags.reduce(function(map, obj) {
			map[obj.tag] = obj.commit;
			return map;
	}, {});
	return mappedTags, tags
}
// WIP
get_tags().then( (tags) => map_tags(tags))

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

const LEFTDATAPOINTS = ["Authors","Commiters"];

/**
 * Replots the graph once a given input is toggled.
 * @param {*} toggledInputElem 
 */
function replotOnToggle(toggledInputElem){

    const checked = toggledInputElem.checked;
    const dataPoints = getBranchData();
    const titleValue = toggledInputElem.name.slice(5).replace("_"," ");
    console.log(titleValue);
    

    if(LEFTDATAPOINTS.includes(titleValue)){
        if(checked){
            dataPoints["leftDataPoints"].push(titleValue);
            console.log("Addinfg")
        }else{
            dataPoints["leftDataPoints"].splice(dataPoints["leftDataPoints"].indexOf(titleValue),1);
            console.log("Removing")
        }
    }else{
        console.log("not in")
    }

    plot_thing()

}


get_commits().then( (commits) => {computeBranchData(commits);plot_thing();})
