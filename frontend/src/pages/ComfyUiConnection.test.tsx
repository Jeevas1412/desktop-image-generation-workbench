import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import ComfyUiConnection from './ComfyUiConnection'

afterEach(() => { delete window.imageWorkbench })

test('labels the target as ComfyUI and calls only the fixed connection IPC action', async () => {
  const request = vi.fn(async (requestValue: { type: string }) => requestValue.type === 'comfyui:profile:get' ? null : ({ service: 'comfyui', state: 'reachable', detail: 'verified' }))
  window.imageWorkbench = { request }
  render(<ComfyUiConnection />)
  expect(screen.getByText('ComfyUI 在哪里运行？')).toBeTruthy()
  expect(screen.getByRole('button', { name: '这台电脑' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '局域网另一台电脑' }))
  fireEvent.change(screen.getByPlaceholderText('例如 192.168.1.20'), { target: { value: '192.168.1.20' } })
  fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: '8188' } })
  fireEvent.click(screen.getByRole('button', { name: '检查并保存连接' }))
  expect(await screen.findByText('ComfyUI 已连接')).toBeTruthy()
  expect(request).toHaveBeenCalledWith({ type: 'comfyui:connection:verify', payload: { profile: { host: '192.168.1.20', port: 8188 } } })
  expect(request).toHaveBeenCalledWith({ type: 'comfyui:profile:save', payload: { profile: { host: '192.168.1.20', port: 8188 } } })
})

test('splits a pasted ComfyUI HTTP address before the fixed IPC verification', async () => {
  const request = vi.fn(async (requestValue: { type: string }) => requestValue.type === 'comfyui:profile:get' ? null : ({ service: 'comfyui', state: 'reachable', detail: 'verified' }))
  window.imageWorkbench = { request }
  render(<ComfyUiConnection />)
  fireEvent.click(screen.getByRole('button', { name: '局域网另一台电脑' }))
  fireEvent.change(screen.getByPlaceholderText('例如 192.168.1.20'), { target: { value: 'http://192.168.10.8:8189' } })
  fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: '8189' } })
  fireEvent.click(screen.getByRole('button', { name: '检查并保存连接' }))
  expect(await screen.findByText('ComfyUI 已连接')).toBeTruthy()
  expect(request).toHaveBeenCalledWith({ type: 'comfyui:connection:verify', payload: { profile: { host: '192.168.10.8', port: 8189 } } })
})
