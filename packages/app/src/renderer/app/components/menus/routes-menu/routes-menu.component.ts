import {
  AsyncPipe,
  NgClass,
  NgStyle,
  NgTemplateOutlet,
  UpperCasePipe
} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import {
  FormsModule,
  ReactiveFormsModule,
  UntypedFormBuilder,
  UntypedFormGroup
} from '@angular/forms';
import { DeployInstance } from '@mockoon/cloud';
import {
  Environment,
  Environments,
  Folder,
  FolderChild,
  ReorderAction,
  ReorderableContainers,
  ResponseMode,
  Route
} from '@mockoon/commons';
import {
  NgbDropdown,
  NgbDropdownMenu,
  NgbDropdownToggle,
  NgbPopover,
  NgbTooltip
} from '@ng-bootstrap/ng-bootstrap';
import { Observable, Subject, merge, of } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  takeUntil,
  tap,
  withLatestFrom
} from 'rxjs/operators';
import {
  DropdownMenuComponent,
  DropdownMenuItem
} from 'src/renderer/app/components/dropdown-menu/dropdown-menu.component';
import { EditableElementComponent } from 'src/renderer/app/components/editable-element/editable-element.component';
import { FilterComponent } from 'src/renderer/app/components/filter/filter.component';
import { SvgComponent } from 'src/renderer/app/components/svg/svg.component';
import { DraggableDirective } from 'src/renderer/app/directives/draggable.directive';
import { DropzoneDirective } from 'src/renderer/app/directives/dropzone.directive';
import { ResizeColumnDirective } from 'src/renderer/app/directives/resize-column.directive';
import { ScrollWhenActiveDirective } from 'src/renderer/app/directives/scroll-to-active.directive';
import { TourStepDirective } from 'src/renderer/app/directives/tour-step.directive';
import { FocusableInputs } from 'src/renderer/app/enums/ui.enum';
import { buildFullPath, textFilter } from 'src/renderer/app/libs/utils.lib';
import {
  DuplicatedRoutesTypes,
  EnvironmentsStatuses
} from 'src/renderer/app/models/store.model';
import { EnvironmentsService } from 'src/renderer/app/services/environments.service';
import { MainApiService } from 'src/renderer/app/services/main-api.service';
import { UIService } from 'src/renderer/app/services/ui.service';
import { Store } from 'src/renderer/app/stores/store';
import { Config } from 'src/renderer/config';
import { Settings } from 'src/shared/models/settings.model';

type FullFolder = {
  uuid: string;
  name: string;
  children: (
    | { type: 'folder'; data: Folder }
    // routes has an extra property isHidden$ that is an observable of the route visibility based on the search filter (thus we avoid using a function in the template)
    | { type: 'route'; isHidden$: Observable<boolean>; data: Route }
  )[];
};

type routeDropdownMenuPayload = { parentId: string; routeUuid: string };
type folderDropdownMenuPayload = { folder: Folder; folderUuid: string };

@Component({
  selector: 'app-routes-menu',
  templateUrl: './routes-menu.component.html',
  styleUrls: ['./routes-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgbPopover,
    TourStepDirective,
    NgbDropdown,
    NgbDropdownToggle,
    SvgComponent,
    NgbDropdownMenu,
    FilterComponent,
    NgTemplateOutlet,
    ResizeColumnDirective,
    DraggableDirective,
    DropzoneDirective,
    NgClass,
    ScrollWhenActiveDirective,
    NgStyle,
    FormsModule,
    ReactiveFormsModule,
    EditableElementComponent,
    DropdownMenuComponent,
    NgbTooltip,
    AsyncPipe,
    UpperCasePipe
  ]
})
export class RoutesMenuComponent implements OnInit, OnDestroy {
  @ViewChild('routesMenu')
  private routesMenu: ElementRef<HTMLUListElement>;
  public settings$: Observable<Settings>;
  public activeEnvironment$: Observable<Environment>;
  public isActiveEnvironmentCloud$ = this.store.selectIsActiveEnvCloud();
  public environments$: Observable<Environments> =
    this.store.select('environments');
  public rootFolder$: Observable<FullFolder>;
  public activeRoute$: Observable<Route>;
  public environmentsStatus$: Observable<EnvironmentsStatuses>;
  public duplicatedRoutes$: Observable<DuplicatedRoutesTypes>;
  public disabledRoutes$: Observable<string[]>;
  public collapsedFolders$: Observable<string[]>;
  public routesFilter$: Observable<string>;
  public dragEnabled = true;
  public focusableInputs = FocusableInputs;
  public folderForm: UntypedFormGroup;
  public menuSize = Config.defaultSecondaryMenuSize;
  public draggedFolderCollapsed: boolean;
  public ResponseMode = ResponseMode;
  public isWeb = Config.isWeb;
  public routeDropdownMenuItems: DropdownMenuItem[] = [
    {
      label: 'Duplicate',
      icon: 'content_copy',
      twoSteps: false,
      action: ({ parentId, routeUuid }: routeDropdownMenuPayload) => {
        this.environmentsService.duplicateRoute(parentId, routeUuid);
      }
    },
    {
      label: 'Duplicate to environment',
      icon: 'input',
      twoSteps: false,
      disabled$: () =>
        this.environments$.pipe(map((environments) => environments.length < 2)),
      action: ({ routeUuid }: routeDropdownMenuPayload) => {
        this.environmentsService.startEntityDuplicationToAnotherEnvironment(
          routeUuid,
          'route'
        );
      }
    },
    ...(this.isWeb
      ? []
      : [
          {
            label: 'Copy configuration to clipboard (JSON)',
            icon: 'assignment',
            twoSteps: false,
            action: ({ routeUuid }: routeDropdownMenuPayload) => {
              this.environmentsService.copyRouteToClipboard(routeUuid);
            }
          }
        ]),
    {
      label: 'Copy full path to clipboard',
      icon: 'assignment',
      twoSteps: false,
      action: ({ routeUuid }: routeDropdownMenuPayload) => {
        const activeEnvironment = this.store.getActiveEnvironment();
        const route = this.store.getRouteByUUID(routeUuid);

        let activeInstance: DeployInstance;

        if (this.isWeb) {
          activeInstance = this.store
            .get('deployInstances')
            .find(
              (instance) => instance.environmentUuid === activeEnvironment.uuid
            );
        }

        this.mainApiService.send(
          'APP_WRITE_CLIPBOARD',
          buildFullPath(activeEnvironment, route, activeInstance)
        );
      }
    },
    ...(this.isWeb
      ? []
      : [
          {
            label: 'Toggle',
            icon: 'power_settings_new',
            twoSteps: false,
            action: ({ routeUuid }: routeDropdownMenuPayload) => {
              this.environmentsService.toggleRoute(routeUuid);
            }
          }
        ]),
    {
      label: 'Delete',
      icon: 'delete',
      confirmIcon: 'error',
      confirmLabel: 'Confirm deletion',
      twoSteps: true,
      action: ({ routeUuid }: routeDropdownMenuPayload) => {
        this.environmentsService.removeRoute(routeUuid);
      }
    }
  ];
  public folderDropdownMenuItems: DropdownMenuItem[] = [
    {
      label: 'Add CRUD route',
      icon: 'endpoints',
      twoSteps: false,
      action: ({ folderUuid }: folderDropdownMenuPayload) => {
        this.environmentsService.addCRUDRoute(folderUuid);
      }
    },
    {
      label: 'Add HTTP route',
      icon: 'endpoint',
      twoSteps: false,
      action: ({ folderUuid }: folderDropdownMenuPayload) => {
        this.environmentsService.addHTTPRoute(folderUuid);
      }
    },
    {
      label: 'Add folder',
      icon: 'folder',
      twoSteps: false,
      action: ({ folderUuid }: folderDropdownMenuPayload) => {
        this.environmentsService.addFolder(folderUuid);
      }
    },
    {
      label: 'Add/Remove prefix',
      icon: 'chevron_right',
      twoSteps: false,
      action: ({ folderUuid }: folderDropdownMenuPayload) => {
        this.environmentsService.updatePrefixFolder(folderUuid);
      }
    },
    ...(this.isWeb
      ? []
      : [
          {
            label: 'Toggle direct child routes',
            icon: 'power_settings_new',
            twoSteps: false,
            action: ({ folderUuid }: folderDropdownMenuPayload) => {
              this.environmentsService.toggleFolder(folderUuid);
            }
          }
        ]),
    {
      label: 'Delete folder',
      icon: 'delete',
      twoSteps: true,
      confirmIcon: 'error',
      confirmLabel: 'Confirm deletion',
      disabled$: ({ folder }: folderDropdownMenuPayload) =>
        of(folder.children.length > 0),
      disabledLabel: 'Delete folder (not empty)',
      action: ({ folderUuid }: folderDropdownMenuPayload) => {
        this.environmentsService.removeFolder(folderUuid);
      }
    }
  ];
  private destroy$ = new Subject<void>();

  constructor(
    private environmentsService: EnvironmentsService,
    private store: Store,
    private uiService: UIService,
    private formBuilder: UntypedFormBuilder,
    private mainApiService: MainApiService
  ) {}

  ngOnInit() {
    this.activeEnvironment$ = this.store.selectActiveEnvironment();
    this.activeRoute$ = this.store.selectActiveRoute();
    this.duplicatedRoutes$ = this.store.select('duplicatedRoutes');
    this.environmentsStatus$ = this.store.select('environmentsStatus');
    this.settings$ = this.store.select('settings');
    this.routesFilter$ = this.store.selectFilter('routes');
    this.disabledRoutes$ = this.store.selectActiveEnvironment().pipe(
      withLatestFrom(this.store.select('settings')),
      filter(
        ([activeEnvironment, settings]) => !!activeEnvironment && !!settings
      ),
      map(([activeEnvironment, settings]) => {
        return settings.disabledRoutes?.[activeEnvironment.uuid] || [];
      })
    );
    this.collapsedFolders$ = this.store.selectActiveEnvironment().pipe(
      withLatestFrom(this.store.select('settings')),
      filter(
        ([activeEnvironment, settings]) => !!activeEnvironment && !!settings
      ),
      map(([activeEnvironment, settings]) => {
        return settings.collapsedFolders?.[activeEnvironment.uuid] || [];
      })
    );

    this.rootFolder$ = this.store.selectActiveEnvironment().pipe(
      filter((activeEnvironment) => !!activeEnvironment),
      distinctUntilChanged(),
      map((activeEnvironment) => {
        const rootFolder = this.prepareFolders(activeEnvironment.rootChildren, [
          ...activeEnvironment.folders,
          ...activeEnvironment.routes
        ]);

        return {
          uuid: 'root',
          name: 'root',
          children: rootFolder.children
        };
      })
    );

    this.initForms();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.unsubscribe();
  }

  /**
   * check if the route is hidden by the search filter
   *
   * @param search
   * @param route
   * @returns
   */
  public isRouteHidden(search: string, route: Route) {
    return !`${route.method} ${route.endpoint} ${route.documentation}`
      .toLowerCase()
      .includes(search.toLowerCase());
  }

  /**
   * Callback called when reordering routes and folders
   *
   * @param reorderAction
   */
  public reorderRoutes(reorderAction: ReorderAction) {
    this.environmentsService.reorderItems(
      reorderAction as ReorderAction<string>,
      ReorderableContainers.ROUTES
    );
  }

  /**
   * Create a new route in the current environment. Append at the end of the list
   */
  public addCRUDRoute() {
    this.environmentsService.addCRUDRoute('root');
  }

  /**
   * Generate a new template
   */
  public addCRUDRouteTemplate() {
    this.uiService.openModal('templates');
  }

  /**
   * Create a new route in the current environment. Append at the end of the list
   */
  public addHTTPRoute() {
    this.environmentsService.addHTTPRoute('root');
  }

  /**
   * Create a new route in the current environment. Append at the end of the list
   */
  public addWebSocketRoute() {
    this.environmentsService.addWebSocketRoute('root');
  }

  /**
   * Create a new folder in the current environment
   */
  public addFolder() {
    this.environmentsService.addFolder('root');

    // manually scroll to the bottom when adding a new folder as they cannot use the scrollWhenActive directive
    this.uiService.scrollToBottom(this.routesMenu.nativeElement);
  }

  /**
   * Select a route by UUID, or the first route if no UUID is present
   */
  public selectRoute(routeUUID: string) {
    this.environmentsService.setActiveRoute(routeUUID);
  }

  public toggleCollapse(folder: Folder) {
    this.environmentsService.toggleFolderCollapse(folder.uuid);
  }

  public editFolder(folder: Folder, editing: boolean) {
    if (editing) {
      this.dragEnabled = false;

      this.folderForm.setValue(
        {
          uuid: folder.uuid,
          name: folder.name
        },
        { emitEvent: false }
      );
    } else {
      this.dragEnabled = true;
    }
  }

  /**
   * Create an observable that will emit true if the route should be hidden by the search filter
   *
   * @param search
   * @param route
   * @returns
   */
  private createRouteHiddenObservable(route: Route) {
    return this.routesFilter$.pipe(
      debounceTime(100),
      map(
        (search) =>
          !textFilter(
            `${route.type} ${route.method} /${route.endpoint} ${route.documentation}`,
            search
          )
      )
    );
  }

  /**
   * Fill the folders objects with real sub folders and routes objects
   *
   * @param children
   * @param foldersAndRoutes
   * @returns
   */
  private prepareFolders(
    children: FolderChild[],
    foldersAndRoutes: (Folder | Route)[]
  ): {
    children: (
      | { type: 'folder'; data: Folder }
      | { type: 'route'; isHidden$: Observable<boolean>; data: Route }
    )[];
  } {
    return {
      children: children.map((child) => {
        const foundChild = foldersAndRoutes.find(
          (item) => item.uuid === child.uuid
        );

        if (child.type === 'folder') {
          return {
            type: 'folder',
            data: {
              ...(foundChild as Folder),
              ...(this.prepareFolders(
                (foundChild as Folder).children,
                foldersAndRoutes
              ) as unknown as Folder)
            }
          };
        } else {
          return {
            type: 'route',
            isHidden$: this.createRouteHiddenObservable(foundChild as Route),
            data: foundChild as Route
          };
        }
      })
    };
  }

  /**
   * Init forms and subscribe to changes
   */
  private initForms() {
    this.folderForm = this.formBuilder.group({
      uuid: [''],
      name: ['']
    });

    // send new activeRouteForm values to the store, one by one
    merge(
      ...Object.keys(this.folderForm.controls).map((controlName) =>
        this.folderForm
          .get(controlName)
          .valueChanges.pipe(map((newValue) => ({ [controlName]: newValue })))
      )
    )
      .pipe(
        tap((newFolderProperties: Partial<Folder>) => {
          this.environmentsService.updateFolder(
            this.folderForm.get('uuid').value,
            newFolderProperties
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }
}
