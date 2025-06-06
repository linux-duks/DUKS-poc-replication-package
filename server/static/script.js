async function get_commits(){
    result = await fetch("commits")
    json_commits = await result.json()
    
    return json_commits
}

/**
 * Computes the sum of the LoC differences for a sliding window.
 * @param {*} commits 
 * @param {number} intervalLengthDays 
 * @returns [commit_dates, summed_pos_diffs, summed_neg_diffs, summed_total_diffs]
 */
function sliding_window_diffs(commits, intervalLengthDays){

    let running_minus = commits[0]["minus_diff"];
    let running_plus = commits[0]["plus_diff"];
    let running_acc = commits[0]["plus_diff"] - commits[0]["minus_diff"];

    let window_begin = 0;
    let window_end = 0;

    date_points = []
    plus_points = []
    minus_points = []
    acc_points = []

    for(i = 0; i < commits.length; i+=1){
        
        let thisDate = new Date(commits[i]["author_time"])
        const maxDate = new Date(thisDate).setDate(thisDate.getDate() + intervalLengthDays);
        const minDate = new Date(thisDate).setDate(thisDate.getDate() - intervalLengthDays);

        // First, update the datetime window. Starting with the last commit of the window
        while(window_end < commits.length - 1 && maxDate >= new Date(commits[window_end+1]["author_time"])){
            window_end+=1
            let new_plus = commits[window_end]["plus_diff"]
            let new_minus = commits[window_end]["minus_diff"]
            running_plus += new_plus
            running_minus += new_minus
            running_acc += new_plus - new_minus
        }

        //Update window beginning
        while(minDate > new Date(commits[window_begin]["author_time"])){
            window_begin += 1
            let old_plus = commits[window_begin]["plus_diff"]
            let old_minus = commits[window_begin]["minus_diff"]
            running_plus -= old_plus
            running_minus -= old_minus
            running_acc -= old_plus - old_minus
        }

        date_points.push(thisDate);
        plus_points.push(running_plus);
        minus_points.push(running_minus);
        acc_points.push(running_acc);
    }

    return [date_points, plus_points, minus_points, acc_points]
}

function sliding_window_authors(commits, intervalLengthDays){

    let runningAuthors = {};
    let runningCommiters = {};

    let window_begin = 0;
    let window_end = 0;

    date_points = []
    num_authors = []
    num_commiters = []

    for(i = 0; i < commits.length; i+=1){
        
        let thisDate = new Date(commits[i]["author_time"])
        const maxDate = new Date(thisDate).setDate(thisDate.getDate() + intervalLengthDays);
        const minDate = new Date(thisDate).setDate(thisDate.getDate() - intervalLengthDays);

        // First, update the datetime window. Starting with the last commit of the window
        while(window_end < commits.length - 1 && maxDate >= new Date(commits[window_end+1]["author_time"])){
            window_end+=1

            const thisAuthor = commits[window_end]["tags"]["author"] 
            if (thisAuthor in runningAuthors){
                runningAuthors[thisAuthor] = runningAuthors[thisAuthor] + 1;
            }else{
                runningAuthors[thisAuthor] = 1;
            }

            const thisCommiter = commits[window_end]["tags"]["committer"];
            if (thisCommiter in runningCommiters){
                runningCommiters[thisCommiter] = runningCommiters[thisCommiter] + 1;
            }else{
                runningCommiters[thisCommiter] = 1
            }
        }

        //Update window beginning
        while(minDate > new Date(commits[window_begin]["author_time"])){
            window_begin += 1

            const thisAuthor = commits[window_begin]["tags"]["author"] 
            if (runningAuthors[thisAuthor] <= 1){
                delete runningAuthors[thisAuthor];
            }else{
                runningAuthors[thisAuthor] = runningAuthors[thisAuthor] - 1;
            }

            const thisCommiter = commits[window_begin]["tags"]["committer"];
            if (runningCommiters[thisCommiter] <= 1){
                delete runningCommiters[thisCommiter]
            }else{
                runningCommiters[thisCommiter] = runningCommiters[thisCommiter] - 1;
            }
        }

        date_points.push(thisDate);
        num_authors.push(Object.keys(runningAuthors).length);
        num_commiters.push(Object.keys(runningCommiters).length);
    }

    return [date_points, num_authors ,num_commiters]
}

function plot_thing(commits){


    WINDOW_RADIUS = 5

    commits = loadCommitTags(commits)

    const contribs_results = sliding_window_authors(commits,WINDOW_RADIUS)
    const diffs_results = sliding_window_diffs(commits,WINDOW_RADIUS)
    
    //for(commit of commits){
    //    dates.push(commit["author_time"])
    //} 

    var contributorsTrace = {
        x: contribs_results[0],
        y: contribs_results[1],
        type: 'lines',
        yaxis: 'y',
        name: 'Authors'
    };

    var commitersTrace = {
        x: contribs_results[0],
        y: contribs_results[2],
        type: 'lines',
        yaxis: 'y',
        name: 'Commiters',
    }

    var diffTrace = {
        x: diffs_results[0],
        y: diffs_results[1],
        type: 'lines',
        yaxis: 'y2',
        name: 'LoC Changes'
    };


    var data = [contributorsTrace,commitersTrace,diffTrace];

    var layout = {
        title: 'Test plot with Contributor and Diff Data',
        xaxis: {
            title: 'Date'
        },
        yaxis: {
            title: 'Contributors'
        },
        yaxis2: {
            title: 'LoC Altered',
            overlaying: 'y',
            side: 'right',
            anchor: 'x',
            showgrid: false,
        }
    };


    Plotly.newPlot('plotDiv', data, layout);

}

/**
 * Parses the 'tags' field of every commit object of a list
 * into a json object.
 * @param {*} commits 
 * @returns commits
 */
function loadCommitTags(commits){
    for(commit of commits){
        commit["tags"] = JSON.parse(commit["tags"]);
    }
    return commits
}

get_commits().then( (commits) => plot_thing(commits))