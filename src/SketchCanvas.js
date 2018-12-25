// @flow

import React, { Component } from 'react';
import ReactNative, {
  requireNativeComponent,
  UIManager,
  PanResponder,
  PixelRatio,
  Platform,
  processColor,
} from 'react-native';

type Pos = {
  x: number,
  y: number,
};

type Text = {
  text: string,
  font: string,
  fontSize: number,
  fontColor: string,
  overlay: 'TextOnSketch' | 'SketchOnText',
  anchor: Pos,
  position: Pos,
  coordinate: 'Absolute' | 'Ratio',
  alignment: 'Left' | 'Center' | 'Right',
  lineHeightMultiple: number,
};

type Path = {
  drawer: string,
  size: {
    width: number,
    height: number,
  },
  path: PathData,
};

type PathData = {
  id: number,
  color: string,
  width: number,
  data: Array<string>,
};

type Props = {
  localSourceImage: {
    filename: string,
    directory: string,
    mode: 'AspectFill' | 'AspectFit' | 'ScaleToFill',
  },
  onPathsChange: (e: any) => void,
  onSketchSaved: (a: any, b: any) => void,
  onStrokeEnd: (path: Path) => void,
  onStrokeChanged: (x: number, y: number, path: PathData) => void,
  onStrokeStart: (path: PathData) => void,
  scale: number,
  strokeColor: string,
  strokeWidth: number,
  style: any, // FIXME
  text: Array<Text>,
  touchEnabled: boolean,
  user: string,
};

type States = {
  // text: any, // FIXME
  initialized: boolean,
  width: number,
  height: number,
  paths: Array<Path>,
  pathCount: number,
};

class SketchCanvas extends Component<Props, States> {
  static defaultProps = {
    localSourceImage: null,
    onPathsChange: () => {},
    onSketchSaved: () => {},
    onStrokeChanged: () => {},
    onStrokeEnd: () => {},
    onStrokeStart: () => {},
    scale: 1,
    strokeColor: '#000000',
    strokeWidth: 3,
    style: null,
    text: null,
    touchEnabled: true,
    user: null,
  };

  constructor(props: Props) {
    super(props);
    this._panResponder = PanResponder.create({
      // Ask to be the responder:
      onStartShouldSetPanResponder: (evt, gestureState) => true,
      onStartShouldSetPanResponderCapture: (evt, gestureState) => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => true,
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => true,

      onPanResponderGrant: (evt, gestureState) => {
        const {
          touchEnabled,
          strokeColor,
          strokeWidth,
          onStrokeStart,
        } = this.props;

        if (!touchEnabled) {
          return;
        }

        const { pathCount } = this.state;

        const e = evt.nativeEvent;
        this._offset = { x: e.pageX - e.locationX, y: e.pageY - e.locationY };
        this._path = {
          id: pathCount,
          color: strokeColor,
          width: strokeWidth,
          data: [],
        };

        this.newPath(pathCount, strokeColor, strokeWidth);

        const x = parseFloat((gestureState.x0 - this._offset.x).toFixed(2));
        const y = parseFloat((gestureState.y0 - this._offset.y).toFixed(2));
        this.addPoint(x, y);
        this._path && onStrokeStart(this._path);
      },
      onPanResponderMove: (evt, gestureState) => {
        const { touchEnabled, scale, onStrokeChanged } = this.props;

        if (!touchEnabled) {
          return;
        }

        if (this._path) {
          const px = gestureState.x0 + gestureState.dx / scale - this._offset.x;
          const py = gestureState.y0 + gestureState.dy / scale - this._offset.y;
          const x = parseFloat(px.toFixed(2));
          const y = parseFloat(py.toFixed(2));
          this.addPoint(x, y);
          this._path && onStrokeChanged(x, y, this._path);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        const { touchEnabled, onStrokeEnd, user } = this.props;

        if (!touchEnabled) {
          return;
        }

        if (this._path) {
          const { paths, width, height, pathCount } = this.state;

          const path = {
            path: this._path,
            size: {
              width,
              height,
            },
            drawer: user,
          };

          this.setState({
            paths: [...paths, path],
            pathCount: pathCount + 1,
          });
          onStrokeEnd(path);
        }

        this.endPath();
      },

      onShouldBlockNativeResponder: (evt, gestureState) => {
        return true;
      },
    });
  }

  state = {
    initialized: false,
    width: 0,
    height: 0,
    // text: null,
    paths: [],
    pathCount: 0,
  };

  _pathsToProcess: Array<Path> = [];
  _panResponder: any;
  _path: ?PathData;
  _offset: Pos;

  newPath(id: number, color: string, width: number) {
    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.RNSketchCanvas.Commands.newPath,
      [id, processColor(color), width * SCREEN_SCALE],
    );
  }

  addScalePoint(x: number, y: number, width: number, height: number) {
    const { width: w, height: h } = this.state;

    this.addPoint((x * w) / width, (y * h) / height);
  }

  addPoint(x: number, y: number) {
    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.RNSketchCanvas.Commands.addPoint,
      [x * SCREEN_SCALE, y * SCREEN_SCALE],
    );

    this._path && this._path.data.push(`${x},${y}`);
  }

  endPath() {
    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.RNSketchCanvas.Commands.endPath,
      [],
    );
  }

  clear() {
    this._path = null;
    this.setState({
      paths: [],
    });
    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.RNSketchCanvas.Commands.clear,
      [],
    );
  }

  undo() {
    const { user } = this.props;

    const { paths } = this.state;

    let lastId = -1;

    paths.forEach(d => (lastId = d.drawer === user ? d.path.id : lastId));

    if (lastId >= 0) {
      this.deletePath(lastId);
    }

    return lastId;
  }

  addPath(data: any) {
    // FIXME
    const { initialized, paths, pathCount, width, height } = this.state;

    if (!initialized) {
      if (!this._pathsToProcess.find(p => p.path.id == data.path.id)) {
        this._pathsToProcess.push(data);
      }
      return;
    }

    if (!paths.find(p => p.path.id === data.path.id)) {
      paths.push(data);
    }

    this.setState({
      paths: [...paths],
      pathCount: pathCount + 1,
    });

    const pathData = data.path.data.map((p: string) => {
      const coor = p.split(',').map(pp => parseFloat(pp));
      const x = (coor[0] * SCREEN_SCALE * width) / data.size.width;
      const y = (coor[1] * SCREEN_SCALE * height) / data.size.height;
      return `${x},${y}`;
    });

    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.RNSketchCanvas.Commands.addPath,
      [
        data.path.id,
        processColor(data.path.color),
        data.path.width * SCREEN_SCALE,
        pathData,
      ],
    );
  }

  deletePath(id: number) {
    const { paths } = this.state;

    this.setState({
      paths: paths.filter(p => p.path.id !== id),
    });

    UIManager.dispatchViewManagerCommand(
      this._handle,
      UIManager.RNSketchCanvas.Commands.deletePath,
      [id],
    );
  }

  getPaths() {
    const { paths } = this.state;

    return paths;
  }

  handleOnLayout = (e: any) => {
    // FIXME
    this.setState(
      {
        initialized: true,
        width: e.nativeEvent.layout.width,
        height: e.nativeEvent.layout.height,
      },
      () => {
        if (this._pathsToProcess.length > 0) {
          this._pathsToProcess.forEach(p => this.addPath(p));
        }
      },
    );
  };

  handleOnChange = (e: any) => {
    // FIXME
    const { onPathsChange, onSketchSaved } = this.props;

    if (e.nativeEvent.hasOwnProperty('pathsUpdate')) {
      onPathsChange(e.nativeEvent.pathsUpdate);
    } else if (e.nativeEvent.hasOwnProperty('success')) {
      if (e.nativeEvent.hasOwnProperty('path')) {
        onSketchSaved(e.nativeEvent.success, e.nativeEvent.path);
      } else {
        onSketchSaved(e.nativeEvent.success);
      }
    }
  };

  _handle: any; // FIXME
  handleRef = (ref: any) => {
    // FIXME
    this._handle = ReactNative.findNodeHandle(ref);
  };

  render() {
    const { style, localSourceImage } = this.props;

    // const {
    //   text,
    // } = this.state;

    return (
      <RNSketchCanvas
        {...this._panResponder.panHandlers}
        localSourceImage={localSourceImage}
        onChange={this.handleOnChange}
        onLayout={this.handleOnLayout}
        ref={this.handleRef}
        style={style}
      />
    );
  }
}

const RNSketchCanvas = requireNativeComponent('RNSketchCanvas', SketchCanvas, {
  nativeOnly: {
    nativeID: true,
    onChange: true,
  },
});

const SCREEN_SCALE = Platform.OS === 'ios' ? 1 : PixelRatio.get();

// SketchCanvas.MAIN_BUNDLE = Platform.OS === 'ios' ? UIManager.RNSketchCanvas.Constants.MainBundlePath : '';
// SketchCanvas.DOCUMENT = Platform.OS === 'ios' ? UIManager.RNSketchCanvas.Constants.NSDocumentDirectory : '';
// SketchCanvas.LIBRARY = Platform.OS === 'ios' ? UIManager.RNSketchCanvas.Constants.NSLibraryDirectory : '';
// SketchCanvas.CACHES = Platform.OS === 'ios' ? UIManager.RNSketchCanvas.Constants.NSCachesDirectory : '';

module.exports = SketchCanvas;
