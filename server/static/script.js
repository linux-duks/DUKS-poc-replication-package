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
        acc_points.push(running_acc);
    }

    return [date_points, plus_points, minus_points, acc_points]
}

function sliding_window_authors(commits, intervalLengthDays){

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

function plot_thing(commits){


    WINDOW_RADIUS = 5

    const contribs_results = sliding_window_authors(commits,WINDOW_RADIUS)
    const diffs_results = sliding_window_diffs(commits,WINDOW_RADIUS)
    
    //for(commit of commits){
    //    dates.push(commit["committer_date"])
    //} 

    var contributorsTrace = {
        x: contribs_results[0],
        y: contribs_results[1],
        type: 'lines',
        yaxis: 'y',
        name: 'Authors'
    };

    var committersTrace = {
        x: contribs_results[0],
        y: contribs_results[2],
        type: 'lines',
        yaxis: 'y',
        name: 'Committers',
    }

    var diffTrace = {
        x: diffs_results[0],
        y: diffs_results[1],
        type: 'lines',
        yaxis: 'y2',
        name: 'LoC Changes'
    };


    var data = [contributorsTrace,committersTrace,diffTrace];

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

get_commits().then( (commits) => plot_thing(commits))
