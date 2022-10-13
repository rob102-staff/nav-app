import React from "react";

import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';

import config from "./config.js";
import { DrawRobot, RobotPathFollower } from "./robot";
import { parseMap, normalizeList } from "./map.js";
import { colourStringToRGB, getColor, GridCellCanvas } from "./drawing"

/*******************
 *     BUTTONS
 *******************/

/*******************
 *   Special File Upload Button
 *******************/

 const FileUploader = props => {
  const hiddenFileInput = React.useRef(null);
  
  const handleClick = event => {
    hiddenFileInput.current.click();
  };
  const handleChange = event => {
    const fileUploaded = event.target.files[0];
    props.handleFile(fileUploaded);
  };
  return (
    <>
      <button className={"button"} onClick={handleClick}>
        {props.buttonText}
      </button>
      <input type="file"
             ref={hiddenFileInput}
             onChange={handleChange}
             style={{display:'none'}} 
             accept={props.filetype}
      /> 
    </>
  );
};


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
    <FormControl variant="standard" className="algo-form">
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
 *   WHOLE PAGE
 *******************/

class SceneView extends React.Component {
  constructor(props) {
    super(props);

    // React state.
    this.state = {
      // Map parameters.
      cells: [],
      width: 0,
      height: 0,
      num_cells: 0,
      origin: [0, 0],
      metersPerCell: 0,
      pixelsPerMeter: 0,
      cellSize: 0,
      mapLoaded: false,
      mapfile: null,
      
      // Parameters for the robot path file.
      planfile: null,

      // Robot parameters.
      x: config.MAP_DISPLAY_WIDTH / 2,
      y: config.MAP_DISPLAY_WIDTH / 2,
      theta: 0,
      isRobotClicked: false,
      // Potential field.
      field: [],
      fieldRaw: [],
      fieldHoverVal: 0,
      showField: false,
      // Marked cells for visualization.
      path: [],
      clickedCell: [],
      goalCell: [],
      goalValid: true,
      markedCells: [],
      markedColours: [],
      visitCells: [],
      visitCellColours: [],
      // Algorithm.
      algo: 'PFIELD'
    };

    this.mapColours = [config.MAP_COLOUR_LOW, config.MAP_COLOUR_HIGH];
    this.fieldColours = [config.FIELD_COLOUR_LOW, config.FIELD_COLOUR_HIGH];

    this.robotPathFollower = new RobotPathFollower(100);
    this.robotPathFollower.moveCallback = (x, y) => { this.setRobotPos(x, y); };

    this.clickCanvas = React.createRef();
  }

  /********************
   *  REACT FUNTIONS
   ********************/

  componentDidMount() {
    // Get the window size and watch for resize events.
    this.rect = this.clickCanvas.current.getBoundingClientRect();
    window.addEventListener('resize', (evt) => this.handleWindowChange(evt));
    window.addEventListener('scroll', (evt) => this.handleWindowChange(evt));

  }

  /*****************************
   *  COMPONENT EVENT HANDLERS
   *****************************/

  onFileChange(event) {
    this.setState({ mapfile: event.target.files[0] });
  }

  onMapFileUpload(mapfile) {
    this.setState({ mapfile: mapfile });
    console.log("On File Upload!")
    if (mapfile === null) return;
    var fr = new FileReader();
    fr.onload = (evt) => {
      var map = parseMap(fr.result);
      this.updateMap(map);
    }
    fr.readAsText(mapfile);
  };

  onGoalClear() {
    this.setMarkedCells([], [], [], true);
  }

  onPlan() {
    // If goal isn't valid, don't plan.
    if (!this.setGoal(this.state.clickedCell)) return;
    // Clear visted canvas.
    this.setState({visitCells: [],
                   visitCellColours: []});
    // Stop the robot.
    this.robotPathFollower.stop();

    // Send the plan message to the backend.
    var start_cell = this.pixelsToCell(this.state.x, this.state.y);
    var plan_data = {type: "plan",
                     data: {
                        map_name: this.state.mapfile.name,
                        goal: "[" + this.state.clickedCell[0] + " " + this.state.clickedCell[1] + "]",
                        start: "[" + start_cell[0] + " " + start_cell[1] + "]",
                        algo: config.ALGO_TYPES[this.state.algo].label
                      }
                    };
  }

  onFieldCheck() {
    this.setState({showField: !this.state.showField});
  }

  onAlgoSelect(event) {
    this.setState({algo: event.target.value});
  }

  /*************************
   *  MOUSE EVENT HANDLERS
   *************************/

  handleWindowChange(evt) {
    this.rect = this.clickCanvas.current.getBoundingClientRect();
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
      this.handleMapClick(event);
    }
  }

  handleMouseUp() {
    // Stops the robot from moving if clicked.
    if (this.state.isRobotClicked) this.setState({isRobotClicked: false});
  }

  handleMouseMove(event) {
    if (!this.state.showField && !this.state.isRobotClicked) return;

    var x = event.clientX - this.rect.left;
    var y = this.rect.bottom - event.clientY;

    if (this.state.isRobotClicked) {
      if (this.robotPathFollower.moving) this.robotPathFollower.stop();
      this.setRobotPos(x, y);
    }
    if (this.state.showField && this.state.fieldRaw.length > 0) {
      var cell = this.pixelsToCell(x, y);
      var idx = Math.max(Math.min(cell[1] + cell[0] * this.state.width, this.state.num_cells - 1), 0);
      this.setState({ fieldHoverVal: this.state.fieldRaw[idx] });
    }
  }

  handleMapClick(event) {
    if (!this.state.mapLoaded) return;

    var x = event.clientX - this.rect.left;
    var y = this.rect.bottom - event.clientY;

    var clickedCell = this.pixelsToCell(x, y);

    this.setMarkedCells(this.state.path, clickedCell,
                        this.state.goalCell, this.state.goalValid);
  }

  /********************
   *      HELPERS
   ********************/

  updateMap(result) {
    this.setState({cells: [...result.cells],
                   width: result.width,
                   height: result.height,
                   num_cells: result.num_cells,
                   origin: result.origin,
                   metersPerCell: result.meters_per_cell,
                   cellSize: config.MAP_DISPLAY_WIDTH / result.width,
                   pixelsPerMeter: config.MAP_DISPLAY_WIDTH / (result.width * result.meters_per_cell),
                   mapLoaded: result.cells.length > 0,
                   // Reset all the relevant app properties.
                   field: [],
                   visitCells: [],
                   visitCellColours: [],
                   path: [],
                   clickedCell: [],
                   goalCell: [],
                   goalValid: true,
                   markedCells: [],
                   markedColours: [],
                   isRobotClicked: false});
  }

  setRobotPos(x, y) {
    this.setState({x: x, y: y});
  }

  setGoal(goal) {
    if (goal.length === 0) return false;

    var idx = goal[1] + goal[0] * this.state.width;
    var valid = this.state.cells[idx] < 0.5;
    this.setMarkedCells([], this.state.clickedCell, goal, valid);

    return valid;
  }

  setMarkedCells(path, clicked, goal, goalValid) {
    var cells = [];
    var colours = [];
    if (clicked.length == 2) {
      cells.push(clicked);
      colours.push(config.CLICKED_CELL_COLOUR);
    }
    if (path.length > 0) {
      cells = cells.concat(path);
      colours = colours.concat(new Array(path.length).fill(config.PATH_COLOUR));
    }
    if (goal.length == 2) {
      var goal_c = goalValid ? config.GOAL_CELL_COLOUR : config.BAD_GOAL_COLOUR;
      cells.push(goal);
      colours.push(goal_c);
    }
    this.setState({path: path,
                   clickedCell: clicked,
                   goalCell: goal,
                   goalValid: goalValid,
                   markedCells: [...cells],
                   markedColours: [...colours]});
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

  render() {
    var canvasStyle = {
      width: config.MAP_DISPLAY_WIDTH + "px",
      height: config.MAP_DISPLAY_WIDTH + "px",
    };

    return (
      <div>
        <div className="select-wrapper">
          <AlgoForm onChange={(event) => this.onAlgoSelect(event)} value={this.state.algo}/>
        </div>

        <div className="button-wrapper">
          <FileUploader buttonText={"Upload Map File"} 
            filetype={".map"} 
            handleFile={(event) => { this.onMapFileUpload(event) }}></FileUploader>
          <FileUploader buttonText={"Upload Plan File"}></FileUploader>
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
          <StatusMessage robotCell={this.pixelsToCell(this.state.x, this.state.y)}
                         clickedCell={this.state.clickedCell}
                         showField={this.state.showField} fieldVal={this.state.fieldHoverVal}/>
        </div>

        <div className="canvas-container" style={canvasStyle}>
          <GridCellCanvas id="mapCanvas"
                          cells={this.state.cells}
                          colours={this.mapColours}
                          width={this.state.width} height={this.state.height}
                          canvasSize={config.MAP_DISPLAY_WIDTH} />
          {this.state.showField &&
            <GridCellCanvas id={"fieldCanvas"} cells={this.state.field}
                            colours={this.fieldColours}
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
                     pixelsPerMeter={this.state.pixelsPerMeter} />
          <canvas ref={this.clickCanvas} id="clickCanvas"
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
