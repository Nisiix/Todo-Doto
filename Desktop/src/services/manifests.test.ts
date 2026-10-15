import { describe, expect, it } from 'vitest'
import { dotnetRequirements, netCoreVersion, netFrameworkVersion, parseMsbuildProject, parseSolution, versionHints, vsYearOf } from './manifests'
import { detectStack } from './projectScan'
import { getFs } from './fs'
import { interpretCheck, planCheck } from './prereqCheck'

/** Soluzione di Visual Basic 2010 Express con il progetto in una sottocartella (come ApriProgettoVB6). */
const SLN_VB2010 = `
Microsoft Visual Studio Solution File, Format Version 11.00
# Visual Basic Express 2010
Project("{F184B08F-C81C-45F6-A57F-5ABD9991F28F}") = "ApriProgettoVB6", "ApriProgettoVB6\\ApriProgettoVB6.vbproj", "{6A6F2D2E-1111-2222-3333-444455556666}"
EndProject
Global
EndGlobal
`
const VBPROJ_FX40 = `<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="4.0" DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <MyType>WindowsForms</MyType>
    <TargetFrameworkVersion>v4.0</TargetFrameworkVersion>
  </PropertyGroup>
  <ItemGroup><Reference Include="System.Windows.Forms" /></ItemGroup>
</Project>`
const SLN_2022 = `Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
VisualStudioVersion = 17.8.34330.188
Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "Api", "src\\Api\\Api.csproj", "{1}"
EndProject
Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "Solution Items", "Solution Items", "{2}"
EndProject`

describe('soluzioni e progetti Visual Studio', () => {
  it('versione ed edizione dalla soluzione; le cartelle di soluzione non sono progetti', () => {
    const vb = parseSolution(SLN_VB2010)
    expect(vb.vsYear).toBe(2010)
    expect(vb.edition).toBe('Visual Basic Express 2010')
    expect(vb.projects).toEqual([{ name: 'ApriProgettoVB6', path: 'ApriProgettoVB6/ApriProgettoVB6.vbproj', typeGuid: 'F184B08F-C81C-45F6-A57F-5ABD9991F28F' }])
    const vs22 = parseSolution(SLN_2022)
    expect(vs22.vsYear).toBe(2022)
    expect(vs22.projects.map((p) => p.name)).toEqual(['Api'])
    expect(vsYearOf('10.0')).toBe(2010)
    expect(vsYearOf('16.11')).toBe(2019)
  })
  it('progetto classico .NET Framework: VB.NET, Windows Forms, Visual Studio 2010, niente SDK', () => {
    const p = parseMsbuildProject(VBPROJ_FX40, 'ApriProgettoVB6/ApriProgettoVB6.vbproj')
    expect(p).toMatchObject({ language: 'VB.NET', sdkStyle: false, targets: ['v4.0'], vsYear: 2010 })
    expect(p.kinds).toContain('WinForms')
  })
  it('progetto SDK: .NET SDK della versione dichiarata; global.json prevale', () => {
    const p = parseMsbuildProject('<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>', 'Api.csproj')
    expect(p).toMatchObject({ language: 'C#', sdkStyle: true, kinds: ['ASP.NET Core'] })
    expect(dotnetRequirements(null, [p]).prerequisites).toEqual([{ name: '.NET SDK', version: '8+' }])
    expect(dotnetRequirements(null, [p], '8.0.204').prerequisites).toEqual([{ name: '.NET SDK', version: '8.0.204+' }])
  })
  it('C++: Visual Studio dal set di strumenti', () => {
    const p = parseMsbuildProject('<Project ToolsVersion="15.0"><PropertyGroup><PlatformToolset>v143</PlatformToolset></PropertyGroup></Project>', 'App.vcxproj')
    expect(p).toMatchObject({ language: 'C++', vsYear: 2022 })
  })
  it('versioni dei framework', () => {
    expect(netFrameworkVersion('v4.0')).toBe('4.0')
    expect(netFrameworkVersion('net472')).toBe('4.7.2')
    expect(netFrameworkVersion('net8.0')).toBeNull()
    expect(netCoreVersion('net8.0-windows')).toBe('8.0')
    expect(netCoreVersion('netcoreapp3.1')).toBe('3.1')
  })
})

describe('ApriProgettoVB6: stack ricavato dalla cartella', () => {
  it('VB.NET 2010 Express → Visual Studio 2010+ e .NET Framework 4.0+, senza .NET SDK né Visual Studio 2022', async () => {
    const fs = await getFs()
    await fs.writeTextAtomic('/vb/ApriProgettoVB6/ApriProgettoVB6.sln', SLN_VB2010)
    await fs.writeTextAtomic('/vb/ApriProgettoVB6/ApriProgettoVB6/ApriProgettoVB6.vbproj', VBPROJ_FX40)
    const { stack } = await detectStack('/vb/ApriProgettoVB6')
    expect(stack.languages).toEqual(['VB.NET'])
    expect(stack.frameworks).toEqual(expect.arrayContaining(['WinForms', '.NET Framework']))
    const pre = Object.fromEntries(stack.prerequisites.map((p) => [p.name, p.version]))
    expect(pre['Visual Studio']).toBe('2010+ (Visual Basic Express 2010)')
    expect(pre['.NET Framework']).toBe('4.0+')
    expect(pre).not.toHaveProperty('.NET SDK')
    expect(stack.steps.at(-1)!.title).toBe('Apri ApriProgettoVB6.sln in Visual Studio')
    expect(stack.notes).toContain('.NET Framework 4.0')
  })
  it('Visual Basic 6 (.vbp)', async () => {
    const fs = await getFs()
    await fs.writeTextAtomic('/vb/Vecchio/Vecchio.vbp', 'Type=Exe\nName="Vecchio"\n')
    const { stack } = await detectStack('/vb/Vecchio')
    expect(stack.languages).toEqual(['Visual Basic 6'])
    expect(stack.prerequisites.map((p) => p.name)).toEqual(['Visual Basic 6.0'])
    expect(stack.steps.at(-1)!.title).toBe('Apri Vecchio.vbp in Visual Basic 6.0')
  })
})

describe('verifica di Visual Studio con le versioni vecchie ed Express', () => {
  it('"10.0" letto dal registro vale come Visual Studio 2010', () => {
    const plan = planCheck({ name: 'Visual Studio', check: '' }, 'windows')
    expect(plan.fallback).toContain('VBExpress')
    const out = '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\SxS\\VS7\r\n    10.0    REG_SZ    C:\\Program Files (x86)\\Microsoft Visual Studio 10.0\\\r\n'
    const r = interpretCheck({ code: 0, stdout: out, stderr: '', timedOut: false }, { ...plan, command: plan.fallback! }, '2010+ (Visual Basic Express 2010)')
    expect(r).toMatchObject({ status: 'ok', version: '2010' })
    // Richiesto il 2022: il 2010 è da aggiornare
    expect(interpretCheck({ code: 0, stdout: out, stderr: '', timedOut: false }, { ...plan, command: plan.fallback! }, '2022+').status).toBe('outdated')
  })
  it('.NET Framework dal registro', () => {
    const plan = planCheck({ name: '.NET Framework', check: '' }, 'windows')
    const r = interpretCheck({ code: 0, stdout: '\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\...\\v4\\Full\r\n    Version    REG_SZ    4.8.10008\r\n', stderr: '', timedOut: false }, plan, '4.0+')
    expect(r).toMatchObject({ status: 'ok', version: '4.8.10008' })
  })
})

describe('versioni dichiarate negli altri ecosistemi', () => {
  it('engines, packageManager, requires-python, go.mod, pom, composer', async () => {
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ engines: { node: '>=18.17.0' }, packageManager: 'pnpm@9.1.0' }),
      'pyproject.toml': '[project]\nrequires-python = ">=3.11"\n',
      'go.mod': 'module x\n\ngo 1.22\n',
      'pom.xml': '<properties><maven.compiler.release>21</maven.compiler.release></properties>',
      'composer.json': JSON.stringify({ require: { php: '^8.2' } }),
    }
    const hints = await versionHints(async (n) => files[n] ?? null)
    expect(hints).toMatchObject({ 'Node.js': '18.17.0+', pnpm: '9.1.0+', Python: '3.11+', Go: '1.22+', 'Java JDK': '21+', PHP: '8.2+' })
  })
})

describe('«Rileva dai file del progetto» corregge lo stack già salvato', () => {
  it('ApriProgettoVB6: toglie .NET SDK 8+ e porta Visual Studio da 2022 a 2010+', async () => {
    const { correctPrerequisites } = await import('./projectScan')
    const { EMPTY_STACK } = await import('@/types')
    const fs = await getFs()
    await fs.writeTextAtomic('/vb2/ApriProgettoVB6/ApriProgettoVB6.sln', SLN_VB2010)
    await fs.writeTextAtomic('/vb2/ApriProgettoVB6/ApriProgettoVB6/ApriProgettoVB6.vbproj', VBPROJ_FX40)
    const saved = {
      ...EMPTY_STACK,
      languages: ['C#'],
      prerequisites: [
        { id: 'p1', name: '.NET SDK', version: '8+', url: '', check: 'dotnet --version' },
        { id: 'p2', name: 'Visual Studio', version: '2022', url: '', check: '' },
      ],
    }
    const det = await detectStack('/vb2/ApriProgettoVB6')
    const { stack, corrected } = correctPrerequisites(saved, det)
    expect(corrected).toBe(2)
    expect(stack.prerequisites.map((p) => `${p.name} ${p.version}`)).toEqual(['Visual Studio 2010+ (Visual Basic Express 2010)'])
  })
})

describe('progetti desktop di ogni tipo: cosa dichiarano i file', () => {
  const stackOf = async (dir: string, files: Record<string, string>) => {
    const fs = await getFs()
    for (const [name, text] of Object.entries(files)) await fs.writeTextAtomic(`${dir}/${name}`, text)
    return (await detectStack(dir)).stack
  }
  const names = (s: { prerequisites: { name: string; version: string }[] }) => Object.fromEntries(s.prerequisites.map((p) => [p.name, p.version]))

  it('Delphi VCL', async () => {
    const s = await stackOf('/dk/delphi', { 'Gestionale.dproj': '<Project><PropertyGroup><ProjectVersion>19.5</ProjectVersion><FrameworkType>VCL</FrameworkType></PropertyGroup></Project>', 'Gestionale.dpr': 'program Gestionale;' })
    expect(s.languages).toEqual(['Delphi'])
    expect(s.frameworks).toEqual(expect.arrayContaining(['Delphi', 'VCL']))
    expect(names(s)).toHaveProperty('Delphi (RAD Studio)')
    expect(s.platforms).toEqual(['desktop'])
    expect(s.notes).toContain('ProjectVersion 19.5')
  })
  it('C++ con CMake e Qt 6: versioni minime e compilatore', async () => {
    const s = await stackOf('/dk/qt', { 'CMakeLists.txt': 'cmake_minimum_required(VERSION 3.16)\nproject(App LANGUAGES CXX)\nfind_package(Qt6 REQUIRED COMPONENTS Widgets)\n' })
    expect(s.languages).toEqual(['C++'])
    expect(s.frameworks).toEqual(expect.arrayContaining(['CMake', 'Qt']))
    expect(names(s)).toMatchObject({ CMake: '3.16+', Qt: '6+', 'Visual Studio Build Tools': expect.any(String) })
  })
  it('Python con PyQt (dai requisiti) e con Tkinter (dagli import)', async () => {
    const pyqt = await stackOf('/dk/pyqt', { 'requirements.txt': 'PyQt6==6.6.1\n', 'main.py': 'from PyQt6.QtWidgets import QApplication' })
    expect(pyqt.frameworks).toContain('PyQt')
    expect(pyqt.platforms).toEqual(['desktop'])
    const tk = await stackOf('/dk/tk', { 'app.py': 'import tkinter as tk\nroot = tk.Tk()' })
    expect(tk.languages).toEqual(['Python'])
    expect(tk.frameworks).toEqual(['Tkinter'])
  })
  it('Java con JavaFX e il JDK dichiarato', async () => {
    const s = await stackOf('/dk/javafx', { 'pom.xml': '<project><properties><maven.compiler.release>21</maven.compiler.release></properties><dependencies><dependency><groupId>org.openjfx</groupId></dependency></dependencies></project>' })
    expect(s.frameworks).toContain('JavaFX')
    expect(names(s)['Java JDK']).toBe('21+')
  })
  it('Go con Fyne: serve un compilatore C', async () => {
    const s = await stackOf('/dk/fyne', { 'go.mod': 'module app\n\ngo 1.22\n\nrequire fyne.io/fyne/v2 v2.4.0\n' })
    expect(s.frameworks).toContain('Fyne')
    expect(names(s)).toMatchObject({ Go: '1.22+', 'GCC (MinGW-w64)': '' })
  })
  it('Flutter per Windows: Visual Studio con il C++', async () => {
    const s = await stackOf('/dk/flutter', { 'pubspec.yaml': 'name: app\nenvironment:\n  sdk: ">=3.0.0 <4.0.0"\n  flutter: ">=3.16.0"\ndependencies:\n  flutter:\n    sdk: flutter\n', 'windows/runner/main.cpp': '' })
    expect(s.frameworks).toEqual(expect.arrayContaining(['Flutter', 'Flutter desktop']))
    expect(names(s)['Visual Studio']).toContain('C++')
    expect(names(s)['Flutter SDK']).toBe('3.16.0+')
  })
  it('Access, Visual FoxPro, PowerBuilder, Lazarus', async () => {
    expect((await stackOf('/dk/access', { 'Magazzino.accdb': 'x' })).prerequisites.map((p) => p.name)).toEqual(['Microsoft Access'])
    expect((await stackOf('/dk/fox', { 'Contab.pjx': 'x' })).prerequisites.map((p) => p.name)).toEqual(['Visual FoxPro 9'])
    expect((await stackOf('/dk/pb', { 'Paghe.pbw': 'x' })).prerequisites.map((p) => p.name)).toEqual(['PowerBuilder'])
    expect((await stackOf('/dk/laz', { 'Tool.lpi': '<CONFIG/>' })).prerequisites.map((p) => p.name)).toEqual(['Lazarus'])
  })
  it('la cartella di un singolo progetto li riconosce come progetti', async () => {
    const { inspectFolder } = await import('./projectScan')
    const fs = await getFs()
    const files = ['delphi/App.dproj', 'access/Db.accdb', 'fox/Contab.pjx', 'pb/Paghe.pbw', 'laz/Tool.lpi', 'vb6/Vecchio.vbp', 'cmake/CMakeLists.txt']
    for (const f of files) await fs.writeTextAtomic(`/single/${f}`, 'x')
    for (const f of files) expect((await inspectFolder(`/single/${f.split('/')[0]}`)).kind).toBe('project')
  })
})
