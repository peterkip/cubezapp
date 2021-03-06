(function() {

  window.filePicker.onError = function(e) {
    window.alert('error: ' + e);
  };

  window.filePicker.onData = function(data) {
    var existingData, importingData;
    if (!localStorage.localStoreData) {
      console.log('you must have some existing Cubezapp data first');
      return;
    }
    try {
      existingData = JSON.parse(localStorage.localStoreData);
      importingData = JSON.parse(data);
    } catch (e) {
      window.alert('Failed to process data.');
      return;
    }

    var importingNames = [];
    for (var i = 0, len = importingData.puzzles.length; i < len; ++i) {
      importingNames.push(importingData.puzzles[i].name);
    }
    var existingNames = [];
    for (var i = 0, len = existingData.puzzles.length; i < len; ++i) {
      existingNames.push(existingData.puzzles[i].name);
    }
    window.puzzleMatcher.showMatcher(importingNames, existingNames);

    document.getElementById('import-fields').style.display = 'block';
    document.getElementById('import-button').onclick = function() {
      importData(importingData, existingData);
    };
  };

  function importData(importingData, existingData) {
    var importSettings = document.getElementById('import-settings').checked;

    if (importSettings) {
      existingData.globalSettings = importingData.globalSettings;
    }

    for (var i = 0, len = importingData.puzzles.length; i < len; ++i) {
      var targetPuzzle = window.puzzleMatcher.getExistingForImporting(i);
      if (targetPuzzle >= 0) {
        mergePuzzles(importingData.puzzles[i], existingData.puzzles[targetPuzzle], importSettings);
      } else {
        addPuzzle(importingData.puzzles[i], existingData.puzzles);
      }
    }

    localStorage.localStoreData = JSON.stringify(existingData);

    document.body.innerText = 'Import complete.';
  }

  function mergePuzzles(importing, existing, importSettings) {
    if (importSettings) {
      var keys = Object.keys(importing);
      for (var i = 0, len = keys.length; i < len; ++i) {
        var key = keys[i];
        if (key === 'solves' || key == 'id') {
          continue;
        }
        existing[key] = importing[key];
      }
    }

    existing.solves = (existing.solves || []).concat(importing.solves || []);
    existing.solves.sort(function(a, b) {
      return a.date - b.date;
    });
    for (var i = 1; i < existing.solves.length; ++i) {
      if (existing.solves[i].id === existing.solves[i-1].id) {
        existing.solves.splice(i, 1);
        --i;
      }
    }
  }

  function addPuzzle(importing, existing) {
    var name;
    for (var i = 0, len = existing.length; i <= len; ++i) {
      name = importing.name + (i ? ' (' + i + ')' : '');
      for (var j = 0; j < len; ++j) {
        if (existing[j].name === name) {
          name = null;
          break;
        }
      }
      if (name !== null) {
        break;
      }
    }

    importing.name = name;

    existing.push(importing);
  }

})();
