(function() {

  // CLEAR_DELAY is the number of milliseconds after which a 'clear' event from
  // the LazySolves will take effect.
  var CLEAR_DELAY = 500;

  // When the user is scrolled within LOAD_MORE_THRESHOLD pixels of the bottom
  // of the content, more content will automatically be loaded.
  var LOAD_MORE_THRESHOLD = 200;

  var DEFAULT_WIDTH = 150;

  // TimesList shows the users their times in a linear fashion.
  //
  // This emits the following events:
  // - layout: the width of the TimesList may have changed.
  function TimesList() {
    window.app.EventEmitter.call(this);
    this._$element = $('#times-list');

    this._textMetrics = new window.app.TimeTextMetrics();
    this._rowRange = new window.app.TimesListRowRange();
    this._loader = new window.app.TimesListLoader();
    this._$element.append(this._loader.element());

    // After a 'clear' event, we *should* clear all the data and show a loader.
    // However, sometimes a 'clear' event will be followed pretty much
    // immediately by a 'more' event. To deal with this, we set a short timeout
    // after a clear event before actually clearing what the user sees.
    this._clearEventTimeout = null;

    this._lazySolves = new window.app.LazySolves();
    this._rows = [];
    this._maxRowWidth = 0;
    this._contextMenu = null;

    this._registerModelEvents();
    this._registerViewEvents();
    this._loadMore();
  }

  TimesList.prototype = Object.create(window.app.EventEmitter.prototype);

  TimesList.prototype.layout = function(width) {
    this._$element.css({width: (this._maxRowWidth || DEFAULT_WIDTH) +
      scrollbarWidth()});
    this._loadMoreIfNecessary();
    this._updateRowRange();
  };

  TimesList.prototype.width = function() {
    return this._$element.width();
  };

  TimesList.prototype._clearIfNecessary = function() {
    if (this._clearEventTimeout !== null) {
      clearTimeout(this._clearEventTimeout);
      this._clearEventTimeout = null;
      this._rows = [];
      this._maxRowWidth = 0;
      this._rowRange.setParameters(0, 0, []);
    }
  };

  TimesList.prototype._handleAdd = function() {
    this._clearIfNecessary();

    var solve = this._lazySolves.getSolve(0);
    var row = new window.app.TimesListRow(this._textMetrics, solve);
    this._rows.splice(0, 0, row);

    if (row.getWidth() > this._maxRowWidth) {
      this._maxRowWidth = row.getWidth();
      this._widthChanged();
    }

    this._updateRowRange();
  };

  TimesList.prototype._handleClear = function() {
    if (this._clearEventTimeout === null) {
      this._clearEventTimeout = setTimeout(this._clearIfNecessary.bind(this),
        CLEAR_DELAY);
    }
  };

  TimesList.prototype._handleDelete = function(index) {
    this._clearIfNecessary();

    this._rows.splice(index, 1);
    this._updateRowRange();
    this._loadMoreIfNecessary();

    this._recomputeUpperBoundedMaxRowWidth();
  };

  TimesList.prototype._handleError = function() {
    this._clearIfNecessary();
    this._loader.switchState(window.app.TimesListLoader.STATE_MANUAL_REFRESH);
  };

  TimesList.prototype._handleModify = function(index) {
    this._clearIfNecessary();

    var solve = this._lazySolves.getSolve(index);
    var row = new window.app.TimesListRow(this._textMetrics, solve);
    this._rows[index] = row;

    if (row.getWidth() > this._maxRowWidth) {
      this._maxRowWidth = row.getWidth();
      this._widthChanged();
    } else {
      this._recomputeUpperBoundedMaxRowWidth();
    }

    this._updateRowRange();
  };

  TimesList.prototype._handleMore = function() {
    this._clearIfNecessary();

    if (this._lazySolves.canLoadMore()) {
      this._loader.switchState(window.app.TimesListLoader.STATE_MANUAL_REFRESH);
    } else {
      this._loader.switchState(window.app.TimesListLoader.STATE_HIDDEN);
    }

    var len = this._lazySolves.getLength();
    var oldMaxWidth = this._maxRowWidth;
    for (var i = this._rows.length; i < len; ++i) {
      var solve = this._lazySolves.getSolve(i);
      var row = new window.app.TimesListRow(this._textMetrics, solve);
      this._rows.push(row);
      this._maxRowWidth = Math.max(this._maxRowWidth, row.getWidth());
    }
    if (this._maxRowWidth > oldMaxWidth) {
      this._widthChanged();
    }

    this._updateRowRange();
    this._loadMoreIfNecessary();
  };

  TimesList.prototype._loadMore = function() {
    if (!this._lazySolves.canLoadMore()) {
      this._loader.switchState(window.app.TimesListLoader.STATE_HIDDEN);
    } else {
      this._loader.switchState(window.app.TimesListLoader.STATE_LOADING);
      this._lazySolves.loadMore();
    }
  };

  TimesList.prototype._loadMoreIfNecessary = function() {
    if (!this._lazySolves.canLoadMore()) {
      return;
    }

    var contentHeight = this._rows.length * this._rowRange.getRowHeight();
    var scrollBottom = this._$element.scrollTop() + this._$element.height();
    if (scrollBottom+LOAD_MORE_THRESHOLD > contentHeight) {
      this._loadMore();
    }
  };

  // _recomputeUpperBoundedMaxRowWidth recomputes this._maxRowWidth assuming it
  // cannot have gotten higher than it already was.
  TimesList.prototype._recomputeUpperBoundedMaxRowWidth = function() {
    var oldMaxWidth = this._maxRowWidth;
    this._maxRowWidth = 0;

    // Older solves are more likely to have longer times, so we start there.
    for (var i = this._rows.length-1; i >= 0; --i) {
      this._maxRowWidth = Math.max(this._maxRowWidth, this._rows[i].getWidth());
      if (this._maxRowWidth === oldMaxWidth) {
        return;
      }
    }

    this._widthChanged();
  };

  TimesList.prototype._registerModelEvents = function() {
    this._lazySolves.on('clear', this._handleClear.bind(this));
    this._lazySolves.on('error', this._handleError.bind(this));
    this._lazySolves.on('more', this._handleMore.bind(this));
    this._lazySolves.on('add', this._handleAdd.bind(this));
    this._lazySolves.on('delete', this._handleDelete.bind(this));
    this._lazySolves.on('modify', this._handleModify.bind(this));
  };

  TimesList.prototype._registerViewEvents = function() {
    this._$element.on('scroll', function() {
      this._clearIfNecessary();
      this._loadMoreIfNecessary();
      this._updateRowRange();
    }.bind(this));
    this._loader.on('reload', this._loadMore.bind(this));
    this._rowRange.on('rowClick', this._showMenuForRow.bind(this));
  };

  TimesList.prototype._scrollToShowRow = function(rowIndex, callback) {
    var rowTop = rowIndex * this._rowRange.getRowHeight();
    var rowBottom = (rowIndex + 1) * this._rowRange.getRowHeight();

    var visibleTop = this._$element.scrollTop();
    var visibleHeight = this._$element.height();
    var visibleBottom = visibleTop + visibleHeight;

    var newScrollTop = null;
    if (rowTop < visibleTop) {
      newScrollTop = rowTop;
    } else if (rowBottom > visibleBottom) {
      newScrollTop = rowBottom - visibleHeight
    }

    if (newScrollTop === null) {
      callback();
    } else {
      this._$element.one('scroll', callback);
      this._$element.scrollTop(newScrollTop);
    }
  };

  TimesList.prototype._showMenuForRow = function(rowIndex) {
    this._scrollToShowRow(rowIndex, function() {
      if (rowIndex >= this._rows.length) {
        // NOTE: this may happen in some edge cases. For example, if the data
        // changes while the view is being scrolled.
        return;
      }
      // TODO: show a menu here.
    }.bind(this));
  };

  TimesList.prototype._updateRowRange = function() {
    var visibleTop = this._$element.scrollTop();
    var visibleBottom = visibleTop + this._$element.height();

    var firstVisibleIndex = Math.floor(visibleTop /
      this._rowRange.getRowHeight());
    var lastVisibleIndex = Math.floor(visibleBottom /
      this._rowRange.getRowHeight());

    firstVisibleIndex = Math.min(firstVisibleIndex, this._rows.length-1);
    lastVisibleIndex = Math.min(lastVisibleIndex, this._rows.length-1);

    if (this._rowRange.getLength() !== 1+lastVisibleIndex-firstVisibleIndex ||
        this._rowRange.getStart() !== firstVisibleIndex ||
        this._rowRange.getTotalLength() !== this._rows.length ||
        this._rowRange.getMaxWidth() !== this._maxRowWidth) {
      var newRows = this._rows.slice(firstVisibleIndex, lastVisibleIndex+1);
      this._rowRange.setParameters(this._rows.length, this._maxRowWidth,
        firstVisibleIndex, newRows);
    }
  };

  TimesList.prototype._widthChanged = function() {
    this.emit('layout');
  };

  function scrollbarWidth() {
    // Generate a small scrolling element.
    var $element = $('<div></div>').css({
      width: 200,
      height: 100,
      overflowY: 'scroll',
      position: 'fixed',
      visibility: 'hidden'
    });

    // Generate a tall element to put inside the small one.
    var $content = $('<div></div>').css({height: 300, width: '100%'});
    $element.append($content);

    // Append the small element to the body and measure stuff.
    $(document.body).append($element);
    var result = $element.width() - $content.width();
    $element.remove();

    return result;
  }

  window.app.TimesList = TimesList;

})();
