import {
	getNodeParameterOptions,
	getNodesInformation,
	getNodeTranslationHeaders,
	getNodeTypes,
	getResourceLocatorResults,
} from '@/api/nodeTypes';
import { DEFAULT_NODETYPE_VERSION, STORES } from '@/constants';
import {
	ICategoriesWithNodes,
	INodeCreateElement,
	INodeTypesState,
	IResourceLocatorReqParams,
} from '@/Interface';
import { addHeaders, addNodeTranslation } from '@/plugins/i18n';
import { omit, getCategoriesWithNodes, getCategorizedList } from '@/utils';
import {
	ILoadOptions,
	INodeCredentials,
	INodeListSearchResult,
	INodeParameters,
	INodePropertyOptions,
	INodeTypeDescription,
	INodeTypeNameVersion,
} from 'n8n-workflow';
import { defineStore } from 'pinia';
import Vue from 'vue';
import { useCredentialsStore } from './credentials';
import { useRootStore } from './n8nRootStore';
import { useUsersStore } from './users';
import { useNodeCreatorStore } from './nodeCreator';
function getNodeVersions(nodeType: INodeTypeDescription) {
	return Array.isArray(nodeType.version) ? nodeType.version : [nodeType.version];
}

export const useNodeTypesStore = defineStore(STORES.NODE_TYPES, {
	state: (): INodeTypesState => ({
		nodeTypes: {},
	}),
	getters: {
		allNodeTypes(): INodeTypeDescription[] {
			return Object.values(this.nodeTypes).reduce<INodeTypeDescription[]>(
				(allNodeTypes, nodeType) => {
					const versionNumbers = Object.keys(nodeType).map(Number);
					const allNodeVersions = versionNumbers.map((version) => nodeType[version]);

					return [...allNodeTypes, ...allNodeVersions];
				},
				[],
			);
		},
		allLatestNodeTypes(): INodeTypeDescription[] {
			return Object.values(this.nodeTypes).reduce<INodeTypeDescription[]>(
				(allLatestNodeTypes, nodeVersions) => {
					const versionNumbers = Object.keys(nodeVersions).map(Number);
					const latestNodeVersion = nodeVersions[Math.max(...versionNumbers)];

					if (!latestNodeVersion) return allLatestNodeTypes;

					return [...allLatestNodeTypes, latestNodeVersion];
				},
				[],
			);
		},
		getNodeType() {
			return (nodeTypeName: string, version?: number): INodeTypeDescription | null => {
				const nodeVersions = this.nodeTypes[nodeTypeName];

				if (!nodeVersions) return null;

				const versionNumbers = Object.keys(nodeVersions).map(Number);
				const nodeType = nodeVersions[version || Math.max(...versionNumbers)];

				return nodeType || null;
			};
		},
		isTriggerNode() {
			return (nodeTypeName: string) => {
				const nodeType = this.getNodeType(nodeTypeName);
				return !!(nodeType && nodeType.group.includes('trigger'));
			};
		},
		isCoreNodeType() {
			return (nodeType: INodeTypeDescription) => {
				return nodeType.codex?.categories?.includes('Core Nodes');
			};
		},
		visibleNodeTypes(): INodeTypeDescription[] {
			return this.allLatestNodeTypes.filter((nodeType: INodeTypeDescription) => !nodeType.hidden);
		},
		categoriesWithNodes(): ICategoriesWithNodes {
			const usersStore = useUsersStore();
			return getCategoriesWithNodes(this.visibleNodeTypes, usersStore.personalizedNodeTypes);
		},
		categorizedItems(): INodeCreateElement[] {
			return getCategorizedList(this.categoriesWithNodes);
		},
	},
	actions: {
		setNodeTypes(newNodeTypes: INodeTypeDescription[] = []): void {
			const nodeTypes = newNodeTypes.reduce<Record<string, Record<string, INodeTypeDescription>>>(
				(acc, newNodeType) => {
					const newNodeVersions = getNodeVersions(newNodeType);

					if (newNodeVersions.length === 0) {
						const singleVersion = { [DEFAULT_NODETYPE_VERSION]: newNodeType };

						acc[newNodeType.name] = singleVersion;
						return acc;
					}

					for (const version of newNodeVersions) {
						// Node exists with the same name
						if (acc[newNodeType.name]) {
							acc[newNodeType.name][version] = Object.assign(
								acc[newNodeType.name][version] ?? {},
								newNodeType,
							);
						} else {
							acc[newNodeType.name] = Object.assign(acc[newNodeType.name] ?? {}, {
								[version]: newNodeType,
							});
						}
					}

					return acc;
				},
				{ ...this.nodeTypes },
			);
			Vue.set(this, 'nodeTypes', nodeTypes);

			// Trigger compute of mergedAppNodes getter so it's ready when user opens the node creator
			useNodeCreatorStore().mergedAppNodes;
		},
		removeNodeTypes(nodeTypesToRemove: INodeTypeDescription[]): void {
			this.nodeTypes = nodeTypesToRemove.reduce(
				(oldNodes, newNodeType) => omit(newNodeType.name, oldNodes),
				this.nodeTypes,
			);
		},
		async getNodesInformation(
			nodeInfos: INodeTypeNameVersion[],
			replace = true,
		): Promise<INodeTypeDescription[]> {
			const rootStore = useRootStore();
			const nodesInformation = await getNodesInformation(rootStore.getRestApiContext, nodeInfos);

			nodesInformation.forEach((nodeInformation) => {
				if (nodeInformation.translation) {
					const nodeType = nodeInformation.name.replace('n8n-nodes-base.', '');

					addNodeTranslation({ [nodeType]: nodeInformation.translation }, rootStore.defaultLocale);
				}
			});
			if (replace) this.setNodeTypes(nodesInformation);

			return nodesInformation;
		},
		async getFullNodesProperties(nodesToBeFetched: INodeTypeNameVersion[]): Promise<void> {
			const credentialsStore = useCredentialsStore();
			credentialsStore.fetchCredentialTypes(true);
			await this.getNodesInformation(nodesToBeFetched);
		},
		async getNodeTypes(): Promise<void> {
			const rootStore = useRootStore();
			const nodeTypes = await getNodeTypes(rootStore.getBaseUrl);
			if (nodeTypes.length) {
				this.setNodeTypes(nodeTypes);
			}
		},
		async getNodeTranslationHeaders(): Promise<void> {
			const rootStore = useRootStore();
			const headers = await getNodeTranslationHeaders(rootStore.getRestApiContext);

			if (headers) {
				addHeaders(headers, rootStore.defaultLocale);
			}
		},
		async getNodeParameterOptions(sendData: {
			nodeTypeAndVersion: INodeTypeNameVersion;
			path: string;
			methodName?: string;
			loadOptions?: ILoadOptions;
			currentNodeParameters: INodeParameters;
			credentials?: INodeCredentials;
		}): Promise<INodePropertyOptions[]> {
			const rootStore = useRootStore();
			return getNodeParameterOptions(rootStore.getRestApiContext, sendData);
		},
		async getResourceLocatorResults(
			sendData: IResourceLocatorReqParams,
		): Promise<INodeListSearchResult> {
			const rootStore = useRootStore();
			return getResourceLocatorResults(rootStore.getRestApiContext, sendData);
		},
	},
});
