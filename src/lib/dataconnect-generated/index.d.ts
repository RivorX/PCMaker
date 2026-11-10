import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export enum TicketPriority {
  LOW = "LOW",
  NORMAL = "NORMAL",
  HIGH = "HIGH",
  URGENT = "URGENT",
};

export enum TicketStatus {
  NEW = "NEW",
  ACCEPTED = "ACCEPTED",
  IN_PROGRESS = "IN_PROGRESS",
  WAITING_FOR_PARTS = "WAITING_FOR_PARTS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
};

export enum UserRole {
  CLIENT = "CLIENT",
  TECHNICIAN = "TECHNICIAN",
  ADMIN = "ADMIN",
};



export interface AddConfigurationComponentData {
  configurationComponent_insert: ConfigurationComponent_Key;
}

export interface AddConfigurationComponentVariables {
  configurationId: UUIDString;
  componentId: UUIDString;
  quantity?: number | null;
  priceAtSelection: number;
  isSelected?: boolean | null;
}

export interface AddTicketCommentData {
  ticketComment_insert: TicketComment_Key;
}

export interface AddTicketCommentVariables {
  ticketId: UUIDString;
  authorId: UUIDString;
  content: string;
  isInternal?: boolean | null;
}

export interface ComponentCompatibility_Key {
  id: UUIDString;
  __typename?: 'ComponentCompatibility_Key';
}

export interface ComponentRecommendation_Key {
  id: UUIDString;
  __typename?: 'ComponentRecommendation_Key';
}

export interface ComponentSpecification_Key {
  id: UUIDString;
  __typename?: 'ComponentSpecification_Key';
}

export interface Component_Key {
  id: UUIDString;
  __typename?: 'Component_Key';
}

export interface ConfigurationComponent_Key {
  id: UUIDString;
  __typename?: 'ConfigurationComponent_Key';
}

export interface CreatePcConfigurationData {
  pcConfiguration_insert: PcConfiguration_Key;
}

export interface CreatePcConfigurationVariables {
  userId: UUIDString;
  name: string;
  description?: string | null;
  totalPrice?: number | null;
  estimatedPerformance?: number | null;
  isPublic?: boolean | null;
}

export interface CreateServiceTicketData {
  serviceTicket_insert: ServiceTicket_Key;
}

export interface CreateServiceTicketVariables {
  ticketNumber: string;
  clientId: UUIDString;
  serviceTypeId: UUIDString;
  title: string;
  description: string;
  deviceName?: string | null;
  deviceSerialNumber?: string | null;
  priority?: TicketPriority | null;
}

export interface CreateUserData {
  user_insert: User_Key;
}

export interface CreateUserVariables {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string | null;
  role?: UserRole | null;
}

export interface GetComponentByIdData {
  component?: {
    id: UUIDString;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    componentType: string;
    description?: string | null;
    price: number;
    performanceScore?: number | null;
    productUrl?: string | null;
  } & Component_Key;
}

export interface GetComponentByIdVariables {
  id: UUIDString;
}

export interface GetServiceTicketByIdData {
  serviceTicket?: {
    id: UUIDString;
    ticketNumber: string;
    title: string;
    description: string;
    deviceName?: string | null;
    deviceSerialNumber?: string | null;
    priority: TicketPriority;
    status: TicketStatus;
    estimatedCost?: number | null;
    finalCost?: number | null;
    createdAt: TimestampString;
    updatedAt?: TimestampString | null;
    completedAt?: TimestampString | null;
  } & ServiceTicket_Key;
}

export interface GetServiceTicketByIdVariables {
  id: UUIDString;
}

export interface GetUserByEmailData {
  users: ({
    id: UUIDString;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: UserRole;
    isActive: boolean;
  } & User_Key)[];
}

export interface GetUserByEmailVariables {
  email: string;
}

export interface ListComponentsData {
  components: ({
    id: UUIDString;
    name: string;
    manufacturer?: string | null;
    model?: string | null;
    componentType: string;
    description?: string | null;
    price: number;
    performanceScore?: number | null;
    productUrl?: string | null;
  } & Component_Key)[];
}

export interface ListComponentsVariables {
  type?: string | null;
}

export interface ListPublicConfigurationsData {
  pcConfigurations: ({
    id: UUIDString;
    name: string;
    description?: string | null;
    totalPrice: number;
    estimatedPerformance?: number | null;
    createdAt: TimestampString;
  } & PcConfiguration_Key)[];
}

export interface ListServiceTicketsData {
  serviceTickets: ({
    id: UUIDString;
    ticketNumber: string;
    title: string;
    description: string;
    deviceName?: string | null;
    deviceSerialNumber?: string | null;
    priority: TicketPriority;
    status: TicketStatus;
    estimatedCost?: number | null;
    finalCost?: number | null;
    createdAt: TimestampString;
  } & ServiceTicket_Key)[];
}

export interface ListServiceTypesData {
  serviceTypes: ({
    id: UUIDString;
    name: string;
    description?: string | null;
    basePrice: number;
    completionDate?: DateString | null;
  } & ServiceType_Key)[];
}

export interface PcConfiguration_Key {
  id: UUIDString;
  __typename?: 'PcConfiguration_Key';
}

export interface ServiceTicket_Key {
  id: UUIDString;
  __typename?: 'ServiceTicket_Key';
}

export interface ServiceType_Key {
  id: UUIDString;
  __typename?: 'ServiceType_Key';
}

export interface TicketAttachment_Key {
  id: UUIDString;
  __typename?: 'TicketAttachment_Key';
}

export interface TicketComment_Key {
  id: UUIDString;
  __typename?: 'TicketComment_Key';
}

export interface TicketStatusHistory_Key {
  id: UUIDString;
  __typename?: 'TicketStatusHistory_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface CreateUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateUserVariables): MutationRef<CreateUserData, CreateUserVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateUserVariables): MutationRef<CreateUserData, CreateUserVariables>;
  operationName: string;
}
export const createUserRef: CreateUserRef;

export function createUser(vars: CreateUserVariables): MutationPromise<CreateUserData, CreateUserVariables>;
export function createUser(dc: DataConnect, vars: CreateUserVariables): MutationPromise<CreateUserData, CreateUserVariables>;

interface CreateServiceTicketRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateServiceTicketVariables): MutationRef<CreateServiceTicketData, CreateServiceTicketVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateServiceTicketVariables): MutationRef<CreateServiceTicketData, CreateServiceTicketVariables>;
  operationName: string;
}
export const createServiceTicketRef: CreateServiceTicketRef;

export function createServiceTicket(vars: CreateServiceTicketVariables): MutationPromise<CreateServiceTicketData, CreateServiceTicketVariables>;
export function createServiceTicket(dc: DataConnect, vars: CreateServiceTicketVariables): MutationPromise<CreateServiceTicketData, CreateServiceTicketVariables>;

interface AddTicketCommentRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddTicketCommentVariables): MutationRef<AddTicketCommentData, AddTicketCommentVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: AddTicketCommentVariables): MutationRef<AddTicketCommentData, AddTicketCommentVariables>;
  operationName: string;
}
export const addTicketCommentRef: AddTicketCommentRef;

export function addTicketComment(vars: AddTicketCommentVariables): MutationPromise<AddTicketCommentData, AddTicketCommentVariables>;
export function addTicketComment(dc: DataConnect, vars: AddTicketCommentVariables): MutationPromise<AddTicketCommentData, AddTicketCommentVariables>;

interface CreatePcConfigurationRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreatePcConfigurationVariables): MutationRef<CreatePcConfigurationData, CreatePcConfigurationVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreatePcConfigurationVariables): MutationRef<CreatePcConfigurationData, CreatePcConfigurationVariables>;
  operationName: string;
}
export const createPcConfigurationRef: CreatePcConfigurationRef;

export function createPcConfiguration(vars: CreatePcConfigurationVariables): MutationPromise<CreatePcConfigurationData, CreatePcConfigurationVariables>;
export function createPcConfiguration(dc: DataConnect, vars: CreatePcConfigurationVariables): MutationPromise<CreatePcConfigurationData, CreatePcConfigurationVariables>;

interface AddConfigurationComponentRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddConfigurationComponentVariables): MutationRef<AddConfigurationComponentData, AddConfigurationComponentVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: AddConfigurationComponentVariables): MutationRef<AddConfigurationComponentData, AddConfigurationComponentVariables>;
  operationName: string;
}
export const addConfigurationComponentRef: AddConfigurationComponentRef;

export function addConfigurationComponent(vars: AddConfigurationComponentVariables): MutationPromise<AddConfigurationComponentData, AddConfigurationComponentVariables>;
export function addConfigurationComponent(dc: DataConnect, vars: AddConfigurationComponentVariables): MutationPromise<AddConfigurationComponentData, AddConfigurationComponentVariables>;

interface ListComponentsRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars?: ListComponentsVariables): QueryRef<ListComponentsData, ListComponentsVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars?: ListComponentsVariables): QueryRef<ListComponentsData, ListComponentsVariables>;
  operationName: string;
}
export const listComponentsRef: ListComponentsRef;

export function listComponents(vars?: ListComponentsVariables, options?: ExecuteQueryOptions): QueryPromise<ListComponentsData, ListComponentsVariables>;
export function listComponents(dc: DataConnect, vars?: ListComponentsVariables, options?: ExecuteQueryOptions): QueryPromise<ListComponentsData, ListComponentsVariables>;

interface GetComponentByIdRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetComponentByIdVariables): QueryRef<GetComponentByIdData, GetComponentByIdVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetComponentByIdVariables): QueryRef<GetComponentByIdData, GetComponentByIdVariables>;
  operationName: string;
}
export const getComponentByIdRef: GetComponentByIdRef;

export function getComponentById(vars: GetComponentByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetComponentByIdData, GetComponentByIdVariables>;
export function getComponentById(dc: DataConnect, vars: GetComponentByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetComponentByIdData, GetComponentByIdVariables>;

interface ListServiceTypesRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListServiceTypesData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListServiceTypesData, undefined>;
  operationName: string;
}
export const listServiceTypesRef: ListServiceTypesRef;

export function listServiceTypes(options?: ExecuteQueryOptions): QueryPromise<ListServiceTypesData, undefined>;
export function listServiceTypes(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListServiceTypesData, undefined>;

interface ListServiceTicketsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListServiceTicketsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListServiceTicketsData, undefined>;
  operationName: string;
}
export const listServiceTicketsRef: ListServiceTicketsRef;

export function listServiceTickets(options?: ExecuteQueryOptions): QueryPromise<ListServiceTicketsData, undefined>;
export function listServiceTickets(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListServiceTicketsData, undefined>;

interface GetServiceTicketByIdRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetServiceTicketByIdVariables): QueryRef<GetServiceTicketByIdData, GetServiceTicketByIdVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetServiceTicketByIdVariables): QueryRef<GetServiceTicketByIdData, GetServiceTicketByIdVariables>;
  operationName: string;
}
export const getServiceTicketByIdRef: GetServiceTicketByIdRef;

export function getServiceTicketById(vars: GetServiceTicketByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetServiceTicketByIdData, GetServiceTicketByIdVariables>;
export function getServiceTicketById(dc: DataConnect, vars: GetServiceTicketByIdVariables, options?: ExecuteQueryOptions): QueryPromise<GetServiceTicketByIdData, GetServiceTicketByIdVariables>;

interface ListPublicConfigurationsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListPublicConfigurationsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListPublicConfigurationsData, undefined>;
  operationName: string;
}
export const listPublicConfigurationsRef: ListPublicConfigurationsRef;

export function listPublicConfigurations(options?: ExecuteQueryOptions): QueryPromise<ListPublicConfigurationsData, undefined>;
export function listPublicConfigurations(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<ListPublicConfigurationsData, undefined>;

interface GetUserByEmailRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetUserByEmailVariables): QueryRef<GetUserByEmailData, GetUserByEmailVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetUserByEmailVariables): QueryRef<GetUserByEmailData, GetUserByEmailVariables>;
  operationName: string;
}
export const getUserByEmailRef: GetUserByEmailRef;

export function getUserByEmail(vars: GetUserByEmailVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByEmailData, GetUserByEmailVariables>;
export function getUserByEmail(dc: DataConnect, vars: GetUserByEmailVariables, options?: ExecuteQueryOptions): QueryPromise<GetUserByEmailData, GetUserByEmailVariables>;

