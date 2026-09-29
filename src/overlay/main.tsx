import { render } from 'preact';
import { App } from './App';
import './overlay.css';

render(<App />, document.getElementById('overlay-root')!);
