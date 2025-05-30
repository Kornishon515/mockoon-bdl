import { DeployInstance } from '@mockoon/cloud';
import {
  Environment,
  ParsedJSONBodyMimeTypes,
  ResponseRule,
  Route,
  RouteResponse,
  RouteType,
  stringIncludesArrayItems
} from '@mockoon/commons';
import { EditorModes } from 'src/renderer/app/models/editor.model';
import { Config } from 'src/renderer/config';
import { environment as env } from 'src/renderer/environments/environment';

export const ArrayContainsObjectKey = (
  obj: Record<string, any>,
  arr: string[]
) => {
  if (obj && arr) {
    return !!Object.keys(obj).find((key) => arr.includes(key));
  }

  return false;
};

/**
 * Retrieve the editor mode (Ace editor) from a content type
 *
 * @param contentType
 */
export const GetEditorModeFromContentType = (
  contentType: string
): EditorModes => {
  if (stringIncludesArrayItems(ParsedJSONBodyMimeTypes, contentType)) {
    return 'json';
  } else if (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml+xml')
  ) {
    return 'html';
  } else if (
    contentType.includes('application/xml') ||
    contentType.includes('text/xml') ||
    contentType.includes('application/soap+xml')
  ) {
    return 'xml';
  } else if (contentType.includes('text/css')) {
    return 'css';
  } else {
    return 'text';
  }
};

/**
 * Remove item from array by index
 *
 * @param items
 * @returns
 */
export const RemoveAtIndex = <T>(items: T[], index: number): T =>
  items.splice(index, 1)[0];

/**
 * Insert item in array at index
 *
 * @param items
 * @param index
 * @param item
 * @returns
 *
 */
export const InsertAtIndex = <T>(items: T[], index: number, item: T): T[] => {
  items.splice(index, 0, item);

  return items;
};

/**
 * Make a text human friendly
 *
 * @param text
 * @returns
 */
export const HumanizeText = (text: string): string => {
  text = text
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s{2,}/g, ' ');
  text = text.charAt(0).toUpperCase() + text.slice(1);

  return text;
};

/**
 * When developing the web app locally, we use .appdev tld as .app
 * requires HTTPS (due to HSTS mechanism)
 *
 * @param activeEnvironment
 * @param instance
 * @returns
 */
export const buildApiUrl = (
  activeEnvironment: Environment,
  instance?: DeployInstance
) => {
  const subdomain = instance?.subdomain ? instance.subdomain : '{subdomain}';

  return `${
    Config.isWeb
      ? `${subdomain}.mockoon.app${env.production ? '' : 'dev:5003'}`
      : activeEnvironment?.hostname || `localhost:${activeEnvironment?.port}`
  }`;
};

/**
 * Build a full API endpoint path with protocol, domain and port
 *
 * @param environment
 * @param route
 * @returns
 */
export const buildFullPath = (
  environment: Environment,
  route: Route,
  instance?: DeployInstance
) => {
  if (!environment || !route) {
    return '';
  }

  let protocol = 'http://';

  if (route.type === RouteType.WS) {
    if (environment?.tlsOptions.enabled || instance) {
      protocol = 'wss://';
    } else {
      protocol = 'ws://';
    }
  } else {
    if (environment?.tlsOptions.enabled || (instance && env.production)) {
      protocol = 'https://';
    }
  }

  let routeUrl = `${protocol}${buildApiUrl(environment, instance)}/`;

  if (environment?.endpointPrefix) {
    routeUrl += environment.endpointPrefix + '/';
  }

  // undo the regex escaping done in the route editor
  routeUrl += route.endpoint.replace(/\\\(/g, '(').replace(/\\\)/g, ')');

  return routeUrl;
};

/**
 * Check if two routes are duplicates, if:
 * - CRUD + same endpoint
 * - HTTP + same endpoint + same method
 *
 * @param routeA
 * @param routeB
 * @returns
 */
export const isRouteDuplicates = (
  routeA: Route | Pick<Route, 'type' | 'endpoint' | 'method'>,
  routeB: Route | Pick<Route, 'type' | 'endpoint' | 'method'>
): boolean =>
  (routeB.type === RouteType.CRUD &&
    routeA.type === RouteType.CRUD &&
    routeB.endpoint === routeA.endpoint) ||
  (routeB.type === RouteType.HTTP &&
    routeA.type === RouteType.HTTP &&
    routeB.endpoint === routeA.endpoint &&
    routeB.method === routeA.method);

/**
 * Check if an environment has a route that is a duplicate of the provided route
 *
 * @param environment
 * @param route
 * @param excludeRouteUUID
 * @returns
 */
export const environmentHasRoute = (
  environment: Environment,
  route: Route | Pick<Route, 'type' | 'endpoint' | 'method'>
): boolean =>
  environment.routes.some((envRoute) => isRouteDuplicates(envRoute, route));

export const trackByUuid = (item: any) => item.uuid;
export const trackById = (item: any) => item.id;

/**
 * Check if a text contains all the words (separated by a space) in a search string
 *
 * @param text
 * @param search
 * @returns
 */
export const textFilter = (text: string, search: string) => {
  return search
    .split(' ')
    .filter((searchWord) => !!searchWord)
    .every(
      (searchWord) =>
        !!searchWord && text.toLowerCase().includes(searchWord.toLowerCase())
    );
};

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

/**
 * Serialize a rule object into a unique string representation.
 * Useful for comparing or mapping rules based on their content.
 *
 * @param rule - The rule to serialize.
 * @returns A stringified version of the rule with its key properties.
 */
const serializeRule = (rule: ResponseRule): string =>
  JSON.stringify({
    target: rule.target,
    modifier: rule.modifier,
    value: rule.value,
    invert: rule.invert,
    operator: rule.operator
  });

/**
 * Generates a frequency map of serialized rules.
 * Each unique rule (based on serialized content) becomes a key in the map,
 * with the number of times it appears as the value.
 *
 * @param rules - An array of response rules to analyze.
 * @returns A record object mapping serialized rules to their frequency count.
 */
const getRuleFrequencyMap = (rules: ResponseRule[]): Record<string, number> => {
  return rules.reduce(
    (map, rule) => {
      const key = serializeRule(rule);
      map[key] = (map[key] || 0) + 1;

      return map;
    },
    {} as Record<string, number>
  );
};

/**
 * Checks if a given route response contains the exact same set of rules as the provided list.
 * /!\ This is a strict comparison: both the rules and their counts must match exactly.
 *
 * @param response - The route response object to check.
 * @param rules - An array of rules to compare against the response's rules.
 * @returns True if the rules in the response exactly match the given rules, false otherwise.
 */
export const responseHasRules = (
  response: RouteResponse,
  rules: ResponseRule[]
): boolean => {
  const responseMap = getRuleFrequencyMap(response.rules);
  const targetMap = getRuleFrequencyMap(rules);

  if (Object.keys(responseMap).length !== Object.keys(targetMap).length)
    return false;

  const allKeys = new Set([
    ...Object.keys(responseMap),
    ...Object.keys(targetMap)
  ]);

  for (const key of allKeys) {
    if (responseMap[key] !== targetMap[key]) return false;
  }

  return true;
};
