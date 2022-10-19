import React from "react";
import config from "./config.js";

import mbotUrl from "../assets/mbot.png";

const SMALL = 1e-4;

function isClose(x, y) {
  return Math.abs(x - y) < SMALL;
}

class RobotPathFollower {
  constructor(dt) {
    this.dt = dt;
    this.moveCallback = () => {};

    this.moving = false;
    this.path = [];
    this.idx = 0;
    this.moveInterval = null;
  }

  walkPath(path) {
    if (this.moving) this.stop();
    if (path.length < 1) return;

    this.path = path;
    this.idx = 0;
    this.moving = true;

    this.moveInterval = setInterval(() => { this.iterate(); }, this.dt);
  }

  iterate() {
    if (!this.moving) return;

    if (this.path.length > this.idx) {
      // Move robot to the next waypoint.
      this.moveCallback(this.path[this.idx][0], this.path[this.idx][1]);
      this.idx += 1;
    }
    else {
      this.stop();
    }
  }

  stop() {
    if (this.moveInterval !== null) {
      clearInterval(this.moveInterval);
    }
    this.moving = false;
  }

}

/*******************
 *     ROBOT
 *******************/

class DrawRobot extends React.Component {
  constructor(props) {
    super(props);

    this.robotCanvas = React.createRef();
    this.robotCtx = null;

    this.lastRobotPos = [0, 0];
    this.lastRobotSize = config.ROBOT_DEFAULT_SIZE;
    this.lastRobotAngle = 0;

    this.robotImage = new Image(config.ROBOT_DEFAULT_SIZE, config.ROBOT_DEFAULT_SIZE);
    this.robotImage.src = mbotUrl;
  }

  componentDidMount() {
    this.robotCtx = this.robotCanvas.current.getContext('2d');
    this.robotCtx.transform(1, 0, 0, -1, 0, 0);
    this.robotCtx.transform(1, 0, 0, 1, 0, -this.robotCanvas.current.width);

    // Apply the last transform since it will be cleared when first drawn.
    this.robotCtx.translate(this.lastRobotPos[0], this.lastRobotPos[1]);
    this.robotCtx.rotate(this.lastRobotAngle);

    this.drawRobot();
  }

  robotSize() {
    return this.props.pixelsPerMeter > 0 ? config.ROBOT_SIZE * this.props.pixelsPerMeter : config.ROBOT_DEFAULT_SIZE;
  }

  hasMoved() {
    return (!isClose(this.lastRobotPos[0], this.props.x) ||
            !isClose(this.lastRobotPos[1], this.props.y) ||
            !isClose(this.lastRobotAngle, this.props.theta) ||
            !isClose(this.lastRobotSize, this.robotSize()));
  }

  drawRobot() {
    var robotSize = this.robotSize();

    // Clear the robot position.
    this.robotCtx.clearRect(-robotSize / 2, -robotSize / 2, robotSize, robotSize);

    // Reset the canvas since the last draw.
    this.robotCtx.rotate(-this.lastRobotAngle);
    this.robotCtx.translate(-this.lastRobotPos[0], -this.lastRobotPos[1]);

    // Translate to the current robot position.
    this.robotCtx.translate(this.props.x, this.props.y);
    this.robotCtx.rotate(this.props.theta);

    // TODO: Scale the image once instead of every time.
    this.robotCtx.drawImage(this.robotImage, -robotSize / 2, -robotSize / 2,
                            robotSize, robotSize);

    // Save these values as last.
    this.lastRobotPos = [this.props.x, this.props.y];
    this.lastRobotSize = robotSize;
    this.lastRobotAngle = this.props.theta;
  }

  componentDidUpdate() {
    if (this.hasMoved()) {
      this.drawRobot();
    }
  }

  render() {
    return (
      <canvas ref={this.robotCanvas} id="robotCanvas"
              width={config.MAP_DISPLAY_WIDTH}
              height={config.MAP_DISPLAY_WIDTH}>
      </canvas>
    );
  }
}

export { DrawRobot, RobotPathFollower };
