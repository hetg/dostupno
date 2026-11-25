## ADDED Requirements

### Requirement: Toolbar icon shows the state on the current site
The toolbar icon and its tooltip SHALL show, for the current tab, whether Доступно is fixing the page. The state SHALL be conveyed by shape and text, not by colour alone, and SHALL update without a reload when the site is turned on or off.

#### Scenario: Доступно is on for the site
- **WHEN** the current tab shows a page where Доступно is running
- **THEN** the toolbar icon is the yellow "Д" on navy
- **AND** its tooltip, announced by screen readers on the toolbar button, is "Доступно: увімкнено на цьому сайті"

#### Scenario: Доступно is off for the site
- **WHEN** the current tab shows a page of a site in `disabledSites`
- **THEN** the toolbar icon is a grey "Д" crossed by a diagonal slash
- **AND** its tooltip is "Доступно: вимкнено на цьому сайті"

#### Scenario: Toggling with the shortcut
- **WHEN** the user presses Alt+Shift+D on a site where Доступно is on
- **THEN** within a second the icon switches to the off icon and tooltip in every open tab of that site, without a reload
- **AND** pressing it again switches them back to the on icon

#### Scenario: Toggling from the popup
- **WHEN** the user flips the site switch in the popup
- **THEN** the icon and tooltip of every open tab of that site follow the new state without a reload

#### Scenario: Page where Доступно can't run
- **WHEN** the current tab shows a browser page (such as settings or the new tab page) or a page opened before Доступно was installed
- **THEN** the icon is the default yellow "Д" on navy and the tooltip is "Доступно"

#### Scenario: Navigating away
- **WHEN** a tab showing the off icon navigates to a site where Доступно is on
- **THEN** the icon and tooltip switch to the on state for the new page

#### Scenario: Greyscale or colour-blind viewing
- **WHEN** the toolbar is seen without colour
- **THEN** the on and off icons are still distinguishable by the slash
