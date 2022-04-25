import React from "react";

/*******************
 * DRAWING HELPERS
 *******************/

function colourStringToRGB(colour_str) {
  var rgb = [parseInt(colour_str.substring(1, 3), 16),
             parseInt(colour_str.substring(3, 5), 16),
             parseInt(colour_str.substring(5, 7), 16)];
  return rgb;
}

function getColor(prob, colour_low, colour_high) {
  // Takes a probability (number from 0 to 1) and converts it into a color code
  var colour_low_a = colourStringToRGB(colour_low);
  var colour_high_a = colourStringToRGB(colour_high);

  var hex = function(x) {
    x = x.toString(16);
    return (x.length == 1) ? '0' + x : x;
  };

  var r = Math.ceil(colour_high_a[0] * prob + colour_low_a[0] * (1 - prob));
  var g = Math.ceil(colour_high_a[1] * prob + colour_low_a[1] * (1 - prob));
  var b = Math.ceil(colour_high_a[2] * prob + colour_low_a[2] * (1 - prob));

  var color = hex(r) + hex(g) + hex(b);
  return "#" + color;
}


class GridCellCanvas extends React.Component {
  constructor(props) {
    super(props);

    this.canvas = React.createRef();
    this.ctx = null;

    this.currentCells = [];
    this.cellStates = new Array(this.props.width * this.props.height).fill('blank');
    this.cellSize = 1;
  }

  componentDidMount() {
    this.ctx = this.canvas.current.getContext('2d');
    this.ctx.transform(1, 0, 0, -1, 0, 0);
    this.ctx.transform(1, 0, 0, 1, 0, -this.canvas.current.width);

    this.cellSize = this.canvas.current.width / this.props.width;

    // Draw cells in case there were any to draw.
    this.drawCells();
  }

  componentDidUpdate() {
    if (this.props.width * this.props.height !== this.cellStates.length) {
      // Size has changed.
      this.cellStates = new Array(this.props.width * this.props.height).fill('blank');
    }

    this.cellSize = this.canvas.current.width / this.props.width;

    // Skip if already updated.
    if (this.currentCells === this.props.cells) return;

    this.drawCells();
  }

  drawCells() {
    this.clear();

    if (this.props.cells.length < 1) {
      // There are no cells to update.
      return;
    }

    if (Array.isArray(this.props.cells[0])) {
      // The cells are index labels.
      var scale = 1;
      if (this.props.cellScale !== "undefined") scale = this.props.cellScale;
      this.drawCellsByIndex(this.props.cells, this.props.colours, scale);
    }
    else if (this.props.cells.length === this.props.width * this.props.height &&
             this.props.colours.length === 2) {
      // This is a colourmap cell.
      var alpha = "ff";
      if (this.props.alpha !== "undefined") alpha = this.props.alpha;
      this.drawCellsGradient(this.props.cells, this.props.colours[0], this.props.colours[1], alpha);
    }

    this.currentCells = this.props.cells;
  }

  getCellIdx(i, j) {
    return i + j * this.props.width;
  }

  setCellColour(idx, c) {
    this.cellStates[this.getCellIdx(idx[0], idx[1])] = c;
  }

  setCellBlank(idx) {
    this.cellStates[this.getCellIdx(idx[0], idx[1])] = 'blank';
  }

  getCellColour(idx) {
    return this.cellStates[this.getCellIdx(idx[0], idx[1])];
  }

  drawCell(cell, size, color, scale=1) {
    var i = cell[1];
    var j = cell[0];
    var shift = size * (1 - scale) / 2;
    var start_x = i * size + shift;
    var start_y = j * size + shift;

    this.ctx.beginPath();
    this.ctx.fillStyle = color;
    this.ctx.fillRect(start_x, start_y, size * scale, size * scale);

    this.setCellColour(cell, color);
  }

  drawCellsGradient(cells, colour_low, colour_high, alpha="ff") {
    if (cells.length !== this.props.width * this.props.height) {
      console.warn("Wrong number of cells:", cells.length, "!=", this.props.width * this.props.height);
      return;
    }

    for (var i = 0; i < this.props.width; i++) {
      for (var j = 0; j < this.props.height; j++) {
        var prob = cells[this.getCellIdx(i, j)];
        var color = getColor(prob, colour_low, colour_high);
        this.drawCell([j, i], this.cellSize, color + alpha);
      }
    }
  }

  drawCellsByIndex(indices, colours, scale=1) {
    if (indices.length !== colours.length) {
      console.warn("Indices length does not match colours length:",
                   indices.length, "!=", colours.length);
      return;
    }

    for (var i = 0; i < indices.length; i++) {
      if (this.getCellColour(indices[i]) !== colours[i]) {
        this.clearCell(indices[i], this.cellSize);
        this.drawCell(indices[i], this.cellSize, colours[i], scale);
      }
    }
  }

  clearCell(cell, size) {
    if (this.getCellColour(cell) === 'blank') return;

    var start_x = cell[1] * size;
    var start_y = cell[0] * size;

    this.ctx.clearRect(start_x, start_y, size, size);
    this.setCellBlank(cell);
  }

  clear() {
    if (this.canvas.current === 'undefined') return;
    this.ctx.clearRect(0, 0, this.canvas.current.width, this.canvas.current.height);

    this.cellStates.fill('blank');
    this.currentCells = [];
  }

  render() {
    return (
      <canvas ref={this.canvas} id={this.props.id}
              width={this.props.canvasSize}
              height={this.props.canvasSize}>
      </canvas>
    );
  }
}

export { colourStringToRGB, getColor, GridCellCanvas };
