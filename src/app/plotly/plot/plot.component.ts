import {
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnDestroy,
    OnChanges,
    OnInit,
    Output,
    SimpleChange,
    SimpleChanges,
    ViewChild,
    DoCheck,
    IterableDiffer,
    IterableDiffers,
    KeyValueDiffer,
    KeyValueDiffers,
} from '@angular/core';

import { Plotly, PlotlyService } from '../plotly.service';
import { NgClass } from '@angular/common';

// @dynamic
@Component({
    selector: 'plotly-plot',
    template: `<div #plot [attr.id]="divId" [className]="getClassName()" [ngStyle]="style"></div>`,
    providers: [PlotlyService],
})
export class PlotComponent implements OnInit, OnChanges, OnDestroy, DoCheck {
    protected defaultClassName = 'js-plotly-plot';

    public plotlyInstance: Plotly.PlotlyHTMLElement;
    public resizeHandler?: (instance: Plotly.PlotlyHTMLElement) => void;
    public layoutDiffer: KeyValueDiffer<string, any>;
    public dataDiffer: IterableDiffer<Plotly.Data>;

    @ViewChild('plot') plotEl: ElementRef;

    @Input() data?: Plotly.Data[];
    @Input() layout?: Partial<Plotly.Layout>;
    @Input() config?: Partial<Plotly.Config>;
    @Input() style?: { [key: string]: string };

    @Input() divId?: string;
    @Input() revision: number = 0;
    @Input() className?: string | string[];
    @Input() debug: boolean = false;
    @Input() useResizeHandler: boolean = false;

    @Output() initialized = new EventEmitter<Plotly.Figure>();
    @Output() update = new EventEmitter<Plotly.Figure>();
    @Output() purge = new EventEmitter<Plotly.Figure>();
    @Output() error = new EventEmitter<Error>();

    @Output() afterExport = new EventEmitter();
    @Output() afterPlot = new EventEmitter();
    @Output() animated = new EventEmitter();
    @Output() animatingFrame = new EventEmitter();
    @Output() animationInterrupted = new EventEmitter();
    @Output() autoSize = new EventEmitter();
    @Output() beforeExport = new EventEmitter();
    @Output() buttonClicked = new EventEmitter();
    @Output() click = new EventEmitter();
    @Output() clickAnnotation = new EventEmitter();
    @Output() deselect = new EventEmitter();
    @Output() doubleClick = new EventEmitter();
    @Output() framework = new EventEmitter();
    @Output() hover = new EventEmitter();
    @Output() legendClick = new EventEmitter();
    @Output() legendDoubleClick = new EventEmitter();
    @Output() relayout = new EventEmitter();
    @Output() restyle = new EventEmitter();
    @Output() redraw = new EventEmitter();
    @Output() selected = new EventEmitter();
    @Output() selecting = new EventEmitter();
    @Output() sliderChange = new EventEmitter();
    @Output() sliderEnd = new EventEmitter();
    @Output() sliderStart = new EventEmitter();
    @Output() transitioning = new EventEmitter();
    @Output() transitionInterrupted = new EventEmitter();
    @Output() unhover = new EventEmitter();

    public eventNames = ['afterExport', 'afterPlot', 'animated', 'animatingFrame', 'animationInterrupted', 'autoSize',
        'beforeExport', 'buttonClicked', 'click', 'clickAnnotation', 'deselect', 'doubleClick', 'framework', 'hover',
        'legendClick', 'legendDoubleClick', 'relayout', 'restyle', 'redraw', 'selected', 'selecting', 'sliderChange',
        'sliderEnd', 'sliderStart', 'transitioning', 'transitionInterrupted', 'unhover'];

    constructor(
        public plotly: PlotlyService,
        public iterableDiffers: IterableDiffers,
        public keyValueDiffers: KeyValueDiffers,
    ) { }

    ngOnInit() {
        this.createPlot().then(() => {
            const figure = this.createFigure();
            this.initialized.emit(figure);
        });
    }

    ngOnDestroy() {
        if (typeof this.resizeHandler === 'function') {
            this.getWindow().removeEventListener('resize', this.resizeHandler as any);
            this.resizeHandler = undefined;
        }

        const figure = this.createFigure();
        this.purge.emit(figure);
    }

    ngOnChanges(changes: SimpleChanges) {
        let shouldUpdate = false;

        const revision: SimpleChange = changes.revision;
        if (revision && !revision.isFirstChange()) {
            shouldUpdate = true;
        }

        const debug: SimpleChange = changes.debug;
        if (debug && !debug.isFirstChange()) {
            shouldUpdate = true;
        }

        if (shouldUpdate) {
            this.updatePlot();
        }

        this.updateWindowResizeHandler();
    }

    ngDoCheck() {
        let shouldUpdate = false;

        if (this.layoutDiffer) {
            const layoutHasDiff = this.layoutDiffer.diff(this.layout);
            if (layoutHasDiff) {
                shouldUpdate = true;
            }
        } else if (this.layout) {
            this.layoutDiffer = this.keyValueDiffers.find(this.layout).create();
        } else {
            this.layoutDiffer = undefined;
        }

        if (this.dataDiffer) {
            const dataHasDiff = this.dataDiffer.diff(this.data);
            if (dataHasDiff) {
                shouldUpdate = true;
            }
        } else if (Array.isArray(this.data)) {
            this.dataDiffer = this.iterableDiffers.find(this.data).create(this.dataDifferTrackBy);
        } else {
            this.dataDiffer = undefined;
        }

        if (shouldUpdate && this.plotlyInstance) {
            this.updatePlot();
        }
    }

    getWindow(): any {
        return window;
    }

    getClassName(): string {
        let classes = [this.defaultClassName];

        if (Array.isArray(this.className)) {
            classes = classes.concat(this.className);
        } else if (this.className) {
            classes.push(this.className);
        }

        return classes.join(' ');
    }

    createPlot(): Promise<void> {
        return this.plotly.newPlot(this.plotEl.nativeElement, this.data, this.layout, this.config).then(plotlyInstance => {
            this.plotlyInstance = plotlyInstance;
            this.getWindow().gd = this.debug ? plotlyInstance : undefined;

            this.eventNames.forEach(name => {
                const eventName = `plotly_${name.toLowerCase()}`;
                plotlyInstance.on(eventName, (data: any) => (this[name] as EventEmitter<void>).emit(data));
            });

            this.updateWindowResizeHandler();
        }, err => {
            console.error('Error while plotting:', err);
            this.error.emit(err);
        });
    }

    createFigure(): Plotly.Figure {
        const p: any = this.plotlyInstance;
        const figure: Plotly.Figure = {
            data: p.data,
            layout: p.layout,
            frames: p._transitionData ? p._transitionData._frames : null
        };

        return figure;
    }

    updatePlot() {
        if (!this.plotlyInstance) {
            const error = new Error(`Plotly component wasn't initialized`);
            this.error.emit(error);
            throw error;
        }

        return this.createPlot().then(() => {
            const figure = this.createFigure();
            this.update.emit(figure);
        });
    }

    updateWindowResizeHandler() {
        if (this.useResizeHandler) {
            if (this.resizeHandler === undefined) {
                this.resizeHandler = () => this.plotly.resize(this.plotlyInstance);
                this.getWindow().addEventListener('resize', this.resizeHandler as any);
            }
        } else {
            if (typeof this.resizeHandler === 'function') {
                this.getWindow().removeEventListener('resize', this.resizeHandler as any);
                this.resizeHandler = undefined;
            }
        }
    }

    dataDifferTrackBy(index: number, item: any): any {
        const obj = Object.assign({}, item, { uid: '' });
        return JSON.stringify(obj);
    }

}
