import type { Address, AddressInput } from '@pawpal/shared';
import { api } from './client';

export const listAddresses = () => api<Address[]>('/addresses');
export const getAddress = (id: number) => api<Address>(`/addresses/${id}`);
export const createAddress = (input: AddressInput) => api<Address>('/addresses', input);
export const updateAddress = (id: number, input: AddressInput) => api<Address>(`/addresses/${id}`, input);
export const makeDefaultAddress = (id: number) => api<Address[]>(`/addresses/${id}/default`, {});
export const deleteAddress = (id: number) => api<Address[]>(`/addresses/${id}/delete`, {});
