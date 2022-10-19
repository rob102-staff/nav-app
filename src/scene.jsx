import React from "react";

import InputLabel from '@mui/material/InputLabel';
import Slider from "@mui/material/Slider";
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
        style={{ display: 'none' }}
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

      // Path planning data
      plan_speed_base: 100, // time in ms.
      plan_speedup: 50, // speed up multiplier.

      // Parameters for the robot path file.
      planfile: null,
      planfile_loaded: false,
      is_planning: false, // Is the path planner running?
      is_paused: false, // Is the path planner paused?
      finished_planning: false, // The path planner has finished running.
      step: 0,

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

  // Callback for when plan speed slider
  onPlanSpeedupChange(_, value) {
    this.setState({ plan_speedup: value });
  }

  /*****************************
   *  COMPONENT EVENT HANDLERS
   *****************************/

  // Callback for when a planner file is uploaded by the user.
  onPlannerFileUpload(file) {
    this.setState({ planner_file: file });

    var reader = new FileReader();

    reader.onload = (e) => {
      var planfile_json = JSON.parse(e.target.result);
      this.updateWithPlanfileJson(planfile_json);
    }
    reader.readAsText(file);

  }

  updateWithPlanfileJson(planfile_json) {
    this.parseAndUpdateMap(planfile_json["map"]);
    this.setState({
      planfile_loaded: true,
      planfile_json: planfile_json
    });
    this.setGoal(planfile_json["goal"]);
    let start_rob_pixels = this.posToPixels(planfile_json["start"][0], planfile_json["start"][1]);
    this.setRobotPos(start_rob_pixels[1], start_rob_pixels[0]);
  }


  // Take a mapfile string, and parse and update the map
  parseAndUpdateMap(mapfile_string) {
    var map = parseMap(mapfile_string);
    this.updateMap(map);
  }

  // When called, this shows all the cells that the robot has visited,
  // and then shows the final path (if it exists).
  async displayFilePlan() {

    if (!this.state.planfile_loaded) {
      return;
    }

    // Ensure that is_planning is set before moving on. 
    await this.setState({ is_planning: true })
    const plan = this.state.planfile_json;

    this.onPlanUpdate(plan, this.state.step);
  }

  // plan is a json containing a list of cell locations and 
  // a list of the path. We first plot the cell locations one by one,
  // then display the path once everything is plotted.
  onPlanUpdate(plan, step) {

    // Stop running the plan update loop if we are 
    // not planning at this moment.
    if (!this.state.is_planning || this.state.is_paused) {
      return;
    }
    // if plan is equal to step length, then plot the path
    if (plan["visited_cells"].length === step) {
      // this.setMarkedCells([], [], plan, true);
      this.setState({ is_planning: false, finished_planning: true });
      this.setState({
        markedCells: plan["path"],
        markedColours: new Array(plan["path"].length).fill(config.CLICKED_CELL_COLOUR),
      })
      this.onMoveRobot(plan["path"], 0); // start moving the robot
      return;
    }

    // plot the cell locations
    var cell = plan["visited_cells"][step];

    var cell_colour = config.VISITED_CELL_COLOUR;
    this.setState({
      visitCells: this.state.visitCells.concat([cell]),
      visitCellColours: this.state.visitCellColours.concat([cell_colour])
    });

    this.state.step += 1;

    // set timeout for the next loop 
    setTimeout(() => this.onPlanUpdate(plan, this.state.step), this.state.plan_speed_base - this.state.plan_speedup);

  }

  // Function that moves the robot along the path 
  // once the path has been plotted.
  onMoveRobot(path, step) {
    if (step >= path.length) {
      return;
    }

    var cell = path[step];
    
    // set robot position to cell position
    var cell_pixels = this.posToPixels(cell[0], cell[1]);
    this.setRobotPos(cell_pixels[1], cell_pixels[0]);

    setTimeout(() => this.onMoveRobot(path, step + 1), this.state.plan_speed_base - this.state.plan_speedup);
  }

  // Callback for when the user clicks the "Pause" button.
  async onTogglePause() {
    const pause_state = this.state.is_paused;
    await this.setState({ is_paused: !this.state.is_paused });

    if (pause_state) {
      this.onPlanUpdate(this.state.planfile_json, this.state.step);
    }
  }

  // Callback for when the user clicks the "Reset" button.
  onResetPlan() {
    this.setState({
      is_planning: false,
      is_paused: false,
      finished_planning: false,
      step: 0,
      visitCells: [],
      visitCellColours: [],
      plan: [],
    });
  }

  onFieldCheck() {
    this.setState({ showField: !this.state.showField });
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
    var robotRadius = config.ROBOT_SIZE * this.state.pixelsPerMeter / 2;
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
    if (this.state.isRobotClicked) this.setState({ isRobotClicked: false });
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
    this.setState({
      cells: [...result.cells],
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
      isRobotClicked: false
    });
  }

  setRobotPos(x, y) {
    this.setState({ x: x, y: y });
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
    this.setState({
      path: path,
      clickedCell: clicked,
      goalCell: goal,
      goalValid: goalValid,
      markedCells: [...cells],
      markedColours: [...colours]
    });
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
        <div className="button-wrapper">
          <FileUploader filetype=".planner" buttonText={"Upload Planner File"} handleFile={(event) => { this.onPlannerFileUpload(event) }} />
          {
            (this.state.mapLoaded && this.state.planfile_loaded && !this.state.is_planning) &&
            <button className="button" onClick={() => this.displayFilePlan()}>Plan!</button>
          }
          {
            (this.state.is_planning) &&
            <button className="button" onClick={() => this.onTogglePause()}>
              {this.state.is_paused ? "Resume" : "Pause"}
            </button>
          }
          {
            (this.state.is_finished || this.state.is_planning) &&
            <button className="button" onClick={() => this.onResetPlan()}>Reset</button>
          }
        </div>

        <div className="status-wrapper">
          <div className="field-toggle-wrapper">
            <Slider value={this.state.plan_speedup ? this.state.plan_speedup : 1} onChange={(_, v) => this.onPlanSpeedupChange(_, v)}></Slider>
            <span>Show Field:</span>
            <label className="switch">
              <input type="checkbox" onClick={() => this.onFieldCheck()} />
              <span className="slider round"></span>
            </label>
          </div>
          <StatusMessage robotCell={this.pixelsToCell(this.state.x, this.state.y)}
            clickedCell={this.state.clickedCell}
            showField={this.state.showField} fieldVal={this.state.fieldHoverVal} />
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
