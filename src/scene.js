import React from "react";

import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';

import config from "./config.js";
import { WSHelper } from "./web.js";
import { parseMap, normalizeList } from "./map.js";
import { colourStringToRGB, getColor, GridCellCanvas } from "./drawing.js"

/*******************
 *     BUTTONS
 *******************/

function StatusMessage(props) {
  var msg = [];
  msg.push("Robot Cell: (" + props.robotCell + ")");
  if (props.clickedCell.length > 0) {
    msg.push("Clicked Cell: (" + props.clickedCell + ")");
  }
  if (props.showField) {
    msg.push("Field: " + props.fieldVal.toFixed(4));
  }

  return (
    <div className="status-msg">
      {msg.join('\xa0\xa0\xa0')}
    </div>
  );
}

function ConnectionStatus(props) {
  var msg = "Wait";
  var colour = "#ffd300";
  if (props.status === WebSocket.OPEN) {
    msg = "Connected";
    colour = "#00ff00";
  }
  else if (props.status === WebSocket.CLOSED) {
    msg = "Not Connected";
    colour = "#ff0000";
  }

  return (
    <div className="status" style={{backgroundColor: colour}}>
      {msg}
    </div>
  );
}

/*******************
 *   ALGO SELECT
 *******************/

function AlgoForm(props) {
  var menu_items = [];
  var key, value;
  for (const algo in config.ALGO_TYPES)
  {
    var data = config.ALGO_TYPES[algo];
    menu_items.push(<MenuItem value={algo} key={data.label}>{data.name}</MenuItem>);
  }
  return (
    <FormControl className="algo-form">
      <InputLabel id="select-algo-label">Algorithm</InputLabel>
      <Select
        labelId="select-algo-label"
        id="select-algo"
        value={props.value}
        onChange={props.onChange}
      >
        {menu_items}
      </Select>
    </FormControl>
  );
}

/*******************
 *     ROBOT
 *******************/

class DrawRobot extends React.Component {
  constructor(props) {
    super(props);

    this.robotCanvas = React.createRef();
    this.robotCtx = null;

    this.robotPos = [config.MAP_DISPLAY_WIDTH / 2, config.MAP_DISPLAY_WIDTH / 2];
    this.robotSize = config.ROBOT_DEFAULT_SIZE;
    this.robotAngle = 0;

    this.robotImage = new Image(config.ROBOT_DEFAULT_SIZE, config.ROBOT_DEFAULT_SIZE);
    this.robotImage.src = '../assets/mbot.png';
  }

  componentDidMount() {
    this.robotCtx = this.robotCanvas.current.getContext('2d');
    this.robotCtx.transform(1, 0, 0, -1, 0, 0);
    this.robotCtx.transform(1, 0, 0, 1, 0, -this.robotCanvas.current.width);

    // Apply the current transform since it will be cleared when first drawn.
    this.robotCtx.translate(this.robotPos[0], this.robotPos[1]);
    this.robotCtx.rotate(this.robotAngle);
  }

  drawRobot() {
    // Clear the robot position.
    this.robotCtx.clearRect(-this.robotSize / 2, -this.robotSize / 2, this.robotSize, this.robotSize);

    // Reset the canvas since the last draw.
    this.robotCtx.rotate(-this.robotAngle);
    this.robotCtx.translate(-this.robotPos[0], -this.robotPos[1]);

    if (this.props.loaded) {
      // this updates position
      this.robotPos = [this.props.x, this.props.y];
      this.robotSize = config.ROBOT_SIZE * this.props.pixelsPerMeter;
      this.robotAngle = this.props.theta;
    }

    this.robotCtx.translate(this.robotPos[0], this.robotPos[1]);
    this.robotCtx.rotate(this.robotAngle);

    // TODO: Scale the image once instead of every time.
    this.robotCtx.drawImage(this.robotImage, -this.robotSize / 2, -this.robotSize / 2,
                            this.robotSize, this.robotSize);
  }

  componentDidUpdate() {
    this.drawRobot();
  }

  render() {
    return (
      <canvas ref={this.robotCanvas}
              width={config.MAP_DISPLAY_WIDTH}
              height={config.MAP_DISPLAY_WIDTH}>
      </canvas>
    );
  }
}

/*******************
 *     CANVAS
 *******************/

function MapFileSelect(props) {
  return (
    <div className="file-input-wrapper">
      <input className="file-input" type="file" onChange={props.onChange} />
    </div>
  );
}

/*******************
 *   WHOLE PAGE
 *******************/

class SceneView extends React.Component {
  constructor(props) {
    super(props);

    // React state.
    this.state = {
      connection: WebSocket.CLOSED,
      cells: [],
      width: 0,
      height: 0,
      num_cells: 0,
      origin: [0, 0],
      metersPerCell: 0,
      pixelsPerMeter: 0,
      cellSize: 0,
      mapLoaded: false,
      x: config.MAP_DISPLAY_WIDTH / 2,
      y: config.MAP_DISPLAY_WIDTH / 2,
      theta: 0,
      mapfile: null,
      field: [],
      fieldRaw: [],
      fieldHoverVal: 0,
      showField: false,
      isRobotClicked: false,
      algo: 'PFIELD',
      mapColours: [config.MAP_COLOUR_LOW, config.MAP_COLOUR_HIGH],
      fieldColours: [config.FIELD_COLOUR_LOW, config.FIELD_COLOUR_HIGH],
      markedCells: [],
      markedColours: [],
      visitCells: [],
      visitCellColours: []
    };

    this.path = [];
    this.clickedCell = [];
    this.goalCell = [];
    this.goalValid = true;

    this.ws = new WSHelper(config.HOST, config.PORT, config.ENDPOINT, config.CONNECT_PERIOD);
    this.ws.userHandleMessage = (evt) => { this.handleMessage(evt); };
    this.ws.statusCallback = (status) => { this.updateSocketStatus(status); };

    this.clickCanvas = React.createRef();
    this.visitCellsCanvas = React.createRef();
  }

  posToPixels(x, y) {
    var u = (x * this.state.cellSize);
    var v = (y * this.state.cellSize);

    return [u, v];
  }

  pixelsToCell(u, v) {
    var row = Math.floor(v / this.state.cellSize);
    var col = Math.floor(u / this.state.cellSize);
    return [row, col];
  }

  componentDidMount() {
    // Get the window size and watch for resize events.
    this.rect = this.clickCanvas.current.getBoundingClientRect();
    window.addEventListener('resize', (evt) => this.handleWindowChange(evt));
    window.addEventListener('scroll', (evt) => this.handleWindowChange(evt));

    // Try to connect to the C++ backend.
    this.ws.attemptConnection();
  }

  handleMessage(msg) {
    var server_msg = JSON.parse(msg.data);

    if (server_msg.type == "robot_path")
    {
      this.handlePath(server_msg.data);
    }
    else if (server_msg.type == "visited_cell")
    {
      this.handleCells(server_msg.data);
    }
    else if (server_msg.type == "field")
    {
      this.handleField(server_msg.data);
    }
    else
    {
      console.log("Unrecognized type", server_msg.type);
    }
  }

  handleWindowChange(evt) {
    this.rect = this.clickCanvas.current.getBoundingClientRect();
  }

  handlePath(msg) {
    this.path = msg.path;
    this.setMarkedCells();
    this.i = 0;
    this.interval = setInterval(this.timer.bind(this), 100);
  }

  handleCells(msg) {
    var visitNew = [...this.state.visitCells];
    visitNew.push(msg.cell);
    var colours = new Array(visitNew.length).fill(config.VISITED_CELL_COLOUR);
    this.setState({visitCells: visitNew,
                   visitCellColours: colours});
  }

  handleField(msg) {
    var rawField = [...msg.field];
    this.setState({ field: [...normalizeList(msg.field)], fieldRaw: rawField });
  }

  updateSocketStatus(status) {
    if (this.state.connection !== status) {
      this.setState({connection: status});
    }
  }

  updateMap(result) {
    var loaded = result.cells.length > 0;
    this.path = [];
    this.clickedCell = [];
    this.goalCell = [];
    this.goalValid = true;

    this.setState({cells: [...result.cells],
                   width: result.width,
                   height: result.height,
                   num_cells: result.num_cells,
                   origin: result.origin,
                   metersPerCell: result.meters_per_cell,
                   cellSize: config.MAP_DISPLAY_WIDTH / result.width,
                   pixelsPerMeter: config.MAP_DISPLAY_WIDTH / (result.width * result.meters_per_cell),
                   mapLoaded: loaded,
                   visitCells: [],
                   visitCellColours: [],
                   isRobotClicked: false});
  }

  onFileChange(event) {
    this.setState({ mapfile: event.target.files[0] });
  }

  onFileUpload() {
    if (this.state.mapfile === null) return;

    var fr = new FileReader();
    fr.onload = (evt) => {
      var map = parseMap(fr.result);
      this.updateMap(map);
    }
    fr.readAsText(this.state.mapfile);

    var map_data = {type: "map_file",
                    data: { file_name: this.state.mapfile.name } };
    this.ws.send(map_data);
  };

  onMapClick(event) {
    if (!this.state.mapLoaded) return;

    var x = event.clientX - this.rect.left;
    var y = this.rect.bottom - event.clientY;

    this.clickedCell = this.pixelsToCell(x, y);

    this.setMarkedCells();
  }

  setMarkedCells() {
    var cells = [];
    var colours = [];
    if (this.clickedCell.length == 2) {
      cells.push(this.clickedCell);
      colours.push(config.CLICKED_CELL_COLOUR);
    }
    if (this.path.length > 0) {
      cells = cells.concat(this.path);
      colours = colours.concat(new Array(this.path.length).fill(config.PATH_COLOUR));
    }
    if (this.goalCell.length == 2) {
      var goal_c = this.goalValid ? config.GOAL_CELL_COLOUR : config.BAD_GOAL_COLOUR;
      cells.push(this.goalCell);
      colours.push(goal_c);
    }
    this.setState({markedCells: [...cells],
                   markedColours: [...colours]});
  }

  handleMouseDown(event) {
    var x = event.clientX - this.rect.left;
    var y = this.rect.bottom - event.clientY;
    var robotRadius = config.ROBOT_SIZE *this.state.pixelsPerMeter / 2;
    // if click is near robot, set isDown as true
    if (x < this.state.x + robotRadius && x > this.state.x - robotRadius &&
        y < this.state.y + robotRadius && y > this.state.y - robotRadius) {
      this.setState({ isRobotClicked: true });
    }
    else {
      this.onMapClick(event);
    }
  }

  handleMouseMove(event) {
    if (!this.state.showField && !this.state.isRobotClicked) return;

    var x = event.clientX - this.rect.left;
    var y = this.rect.bottom - event.clientY;

    if (this.state.isRobotClicked) {
      this.setState({ x: x, y: y });
    }
    if (this.state.showField && this.state.fieldRaw.length > 0) {
      var cell = this.pixelsToCell(x, y);
      var idx = Math.max(Math.min(cell[1] + cell[0] * this.state.width, this.state.num_cells - 1), 0);
      this.setState({ fieldHoverVal: this.state.fieldRaw[idx] });
    }
  }

  handleMouseUp() {
    if (this.state.isRobotClicked == false) return;
    // this moves the robot along the path
    this.setState({isRobotClicked: false});
  }

  timer() {
    var length = this.path.length;
    if(length > this.i) {
      //move robot to the next spot
      this.findDirection();
      this.i = this.i + 1;
    }
    else {
      clearInterval(this.interval);
    }
  }

  findDirection(){
    var newCoord = this.posToPixels(this.path[this.i][1], this.path[this.i][0]);
    if (newCoord[0] == this.state.x && newCoord[1] == this.state.y) return;
    this.setState({x: newCoord[0], y: newCoord[1]});
  }

  onGoalClear() {
    this.path = [];
    this.clickedCell = [];
    this.goalCell = [];
    this.goalValid = true;

    this.setMarkedCells();
  }

  setGoal(goal) {
    if (goal.length === 0) return false;

    var idx = goal[1] + goal[0] * this.state.width;
    var valid = this.state.cells[idx] < 0.5;

    this.goalCell = goal;
    this.goalValid = valid;
    this.path = [];

    this.setMarkedCells();

    return valid;
  }

  onPlan() {
    // If goal isn't valid, don't plan.
    if (!this.setGoal(this.clickedCell)) return;
    // Clear visted canvas
    this.setState({visitCells: [],
                   visitCellColours: []});

    var start_cell = this.pixelsToCell(this.state.x, this.state.y);
    var plan_data = {type: "plan",
                     data: {
                        map_name: this.state.mapfile.name,
                        goal: "[" + this.clickedCell[0] + " " + this.clickedCell[1] + "]",
                        start: "[" + start_cell[0] + " " + start_cell[1] + "]",
                        algo: config.ALGO_TYPES[this.state.algo].label
                      }
                    };
    this.ws.send(plan_data);
  }

  onFieldCheck() {
    this.setState({showField: !this.state.showField});
  }

  handleAlgoSelect(event) {
    this.setState({algo: event.target.value});
  }

    render() {
      var canvasStyle = {
        width: config.MAP_DISPLAY_WIDTH + "px",
        height: config.MAP_DISPLAY_WIDTH + "px",
      };

    return (
      <div>
        <div className="select-wrapper">
          <MapFileSelect onChange={(event) => this.onFileChange(event)}/>
          <AlgoForm onChange={(event) => this.handleAlgoSelect(event)} value={this.state.algo}/>
        </div>

        <div className="button-wrapper">
          <button className="button" onClick={() => this.onFileUpload()}>Upload Map</button>
          <button className="button" onClick={() => this.onGoalClear()}>Clear Goal</button>
          <button className="button" onClick={() => this.onPlan()}>Plan!</button>
        </div>

        <div className="status-wrapper">
          <div className="field-toggle-wrapper">
            <span>Show Field:</span>
            <label className="switch">
              <input type="checkbox" onClick={() => this.onFieldCheck()}/>
              <span className="slider round"></span>
            </label>
          </div>
          <StatusMessage robotCell={this.pixelsToCell(this.state.x, this.state.y)} clickedCell={this.clickedCell}
                         showField={this.state.showField} fieldVal={this.state.fieldHoverVal}/>
          <ConnectionStatus status={this.state.connection}/>
        </div>

        <div className="canvas-container" style={canvasStyle}>
          <GridCellCanvas id="mapCanvas"
                          cells={this.state.cells}
                          colours={this.state.mapColours}
                          width={this.state.width} height={this.state.height}
                          canvasSize={config.MAP_DISPLAY_WIDTH} />
          {this.state.showField &&
            <GridCellCanvas id={"fieldCanvas"} cells={this.state.field}
                            colours={this.state.fieldColours}
                            alpha={config.FIELD_ALPHA}
                            width={this.state.width} height={this.state.height}
                            canvasSize={config.MAP_DISPLAY_WIDTH} />
          }
          <GridCellCanvas id="visitCellsCanvas"
                          cells={this.state.visitCells}
                          colours={this.state.visitCellColours}
                          width={this.state.width} height={this.state.height}
                          cellScale={config.SMALL_CELL_SCALE}
                          canvasSize={config.MAP_DISPLAY_WIDTH} />
          <GridCellCanvas id="cellsCanvas"
                          cells={this.state.markedCells}
                          colours={this.state.markedColours}
                          width={this.state.width} height={this.state.height}
                          cellScale={config.SMALL_CELL_SCALE}
                          canvasSize={config.MAP_DISPLAY_WIDTH} />

          <DrawRobot x={this.state.x} y={this.state.y} theta={this.state.theta}
                     loaded={this.state.mapLoaded} pixelsPerMeter={this.state.pixelsPerMeter}
                     posToPixels={(x, y) => this.posToPixels(x, y)} />
          <canvas ref={this.clickCanvas}
                  width={config.MAP_DISPLAY_WIDTH}
                  height={config.MAP_DISPLAY_WIDTH}
                  onMouseDown={(e) => this.handleMouseDown(e)}
                  onMouseMove={(e) => this.handleMouseMove(e)}
                  onMouseUp={() => this.handleMouseUp()}>
          </canvas>
        </div>
      </div>
    );
  }
}

export default SceneView;
