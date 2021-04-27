import { Map, Point } from 'maplibre-gl';
import BasemapSelectComponent from './components/basemap-select.vue';
import Vue from 'vue';

export class ButtonControl {
	active: boolean;
	element: HTMLElement;
	groupElement: HTMLElement;
	constructor(private className: string, private callback: (...args: any) => any) {
		this.groupElement = document.createElement('div');
		this.groupElement.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
		this.element = document.createElement('button');
		this.element.className = className;
		this.element.onclick = callback;
		this.active = false;
	}
	click(...args: any) {
		this.callback(...args);
	}
	activate(yes: boolean) {
		this.element.classList[yes ? 'add' : 'remove']('active');
		this.active = yes;
	}
	show(yes: boolean) {
		this.element.classList[yes ? 'remove' : 'add']('hidden');
	}
	onAdd() {
		return this.groupElement;
	}
	onRemove() {
		this.element.remove();
		this.groupElement.remove();
	}
}

export class BasemapSelectControl {
	component?: any;
	onAdd(map: Map) {
		this.component = new (Vue.extend(BasemapSelectComponent))({
			propsData: { map },
		});
		this.component.$mount();
		return this.component.$el as HTMLElement;
	}
	onRemove() {
		this.component!.$destroy();
	}
}

type BoxSelectControlOptions = {
	groupElementClass?: string;
	boxElementClass?: string;
	selectButtonClass?: string;
	unselectButtonClass?: string;
	layers: string[];
};

export class BoxSelectControl {
	groupElement: HTMLElement;
	boxElement: HTMLElement;

	selectButton: ButtonControl;
	unselectButton: ButtonControl;

	map?: Map;
	layers: string[];

	selecting: boolean = false;
	shiftPressed: boolean = false;
	startPos: Point | undefined;
	lastPos: Point | undefined;

	onKeyDownHandler: (event: KeyboardEvent) => any;
	onKeyUpHandler: (event: KeyboardEvent) => any;
	onMouseDownHandler: (event: MouseEvent) => any;
	onMouseMoveHandler: (event: MouseEvent) => any;
	onMouseUpHandler: (event: MouseEvent) => any;

	constructor(options: BoxSelectControlOptions) {
		this.layers = options?.layers ?? [];
		this.boxElement = document.createElement('div');
		this.boxElement.className = options?.boxElementClass ?? 'selection-box';
		this.groupElement = document.createElement('div');
		this.groupElement.className = options?.groupElementClass ?? 'mapboxgl-ctrl mapboxgl-ctrl-group';
		this.selectButton = new ButtonControl(options?.selectButtonClass ?? 'ctrl-select', () => {
			this.shiftPressed = !this.shiftPressed;
			this.selectButton.activate(this.shiftPressed);
		});
		this.unselectButton = new ButtonControl(options?.unselectButtonClass ?? 'ctrl-unselect', () => {
			this.reset();
			this.map!.fire('select.end');
		});
		this.groupElement.appendChild(this.selectButton.element);
		this.groupElement.appendChild(this.unselectButton.element);

		this.onKeyDownHandler = this.onKeyDown.bind(this);
		this.onKeyUpHandler = this.onKeyUp.bind(this);
		this.onMouseDownHandler = this.onMouseDown.bind(this);
		this.onMouseMoveHandler = this.onMouseMove.bind(this);
		this.onMouseUpHandler = this.onMouseUp.bind(this);
	}

	onAdd(map: Map) {
		this.map = map;
		this.map!.boxZoom.disable();
		this.map!.getContainer().appendChild(this.boxElement);
		this.map!.getContainer().addEventListener('mousedown', this.onMouseDownHandler, true);
		document.addEventListener('keydown', this.onKeyDownHandler);
		document.addEventListener('keyup', this.onKeyUpHandler);
		return this.groupElement;
	}

	onRemove() {
		this.map!.boxZoom.enable();
		this.boxElement.remove();
		this.groupElement.remove();
		this.map!.getContainer().removeEventListener('mousedown', this.onMouseDownHandler);
		document.removeEventListener('keydown', this.onKeyDownHandler);
		document.removeEventListener('keyup', this.onKeyUpHandler);
	}

	active() {
		return this.shiftPressed || this.selecting;
	}

	getMousePosition(event: MouseEvent): Point {
		const container = this.map!.getContainer();
		const rect = container.getBoundingClientRect();
		return new Point(event.clientX - rect.left - container.clientLeft, event.clientY - rect.top - container.clientTop);
	}

	onKeyDown(event: KeyboardEvent) {
		if (event.key == 'Shift') {
			this.shiftPressed = true;
			this.selectButton.activate(true);
			this.map!.fire('select.enable');
		}
		if (event.key == 'Escape') {
			if (this.active()) {
				this.reset();
				this.map!.fire('select.cancel');
			} else {
				this.map!.fire('select.end');
			}
		}
	}

	onKeyUp(event: KeyboardEvent) {
		if (event.key == 'Shift') {
			this.shiftPressed = false;
			this.selectButton.activate(false);
			this.map!.fire('select.disable');
		}
	}

	onMouseDown(event: MouseEvent) {
		if (!this.shiftPressed) {
			return;
		}
		if (event.button === 0) {
			this.selecting = true;
			this.map!.dragPan.disable();
			this.startPos = this.getMousePosition(event);
			this.lastPos = this.startPos;
			document.addEventListener('mousemove', this.onMouseMoveHandler);
			document.addEventListener('mouseup', this.onMouseUpHandler);
			this.map!.fire('select.start');
		}
	}

	onMouseMove(event: MouseEvent) {
		this.lastPos = this.getMousePosition(event);
		let minX = Math.min(this.startPos!.x, this.lastPos!.x),
			maxX = Math.max(this.startPos!.x, this.lastPos!.x),
			minY = Math.min(this.startPos!.y, this.lastPos!.y),
			maxY = Math.max(this.startPos!.y, this.lastPos!.y);
		const transform = `translate(${minX}px, ${minY}px)`;
		const width = maxX - minX + 'px';
		const height = maxY - minY + 'px';
		this.updateBoxStyle({ transform, width, height });
	}

	onMouseUp() {
		this.reset();
		const features = this.map!.queryRenderedFeatures([this.startPos!, this.lastPos!], {
			layers: this.layers,
		});
		this.map!.fire('select.end', { features });
	}

	reset() {
		this.selecting = false;
		this.updateBoxStyle({ width: '0', height: '0', transform: '' });
		document.removeEventListener('mousemove', this.onMouseMoveHandler);
		document.removeEventListener('mouseup', this.onMouseUpHandler);
		this.map!.dragPan.enable();
	}

	updateBoxStyle(style: { width: string; height: string; transform: string }) {
		this.boxElement.style.transform = style.transform;
		this.boxElement.style.width = style.width;
		this.boxElement.style.height = style.height;
	}
}
