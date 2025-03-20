# Dory Clusters UI Mockup

## Overview
This document illustrates the UI design for displaying clusters beneath the search bar on the new tab page.

## Default View
Below the search bar, three equally spaced squares will display cluster information.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         [Search Bar]                            │
│                                                                 │
├─────────────────┬─────────────────┬─────────────────────────────┤
│                 │                 │                             │
│                 │                 │                             │
│  Programming &  │   News Media    │                             │
│   Development   │                 │     Still learning...       │
│                 │                 │                             │
│                 │                 │                             │
│                 │                 │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

In this example:
- First square: Contains the "Programming & Development" cluster
- Second square: Contains the "News Media" cluster
- Third square: No cluster available yet, displays "Still learning..."

## Expanded View (After Click)
When a cluster square is clicked, it expands to show more details with a dimmed background overlay and centered position:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         [Search Bar]                            │
│                                                                 │
├─────────────────┬─────────────────┬─────────────────────────────┤
│                 │                 │                             │
│                 │                 │                             │
│  Programming &  │   News Media    │                             │
│   Development   │                 │     Still learning...       │
│                 │                 │                             │
│                 │                 │                             │
│                 │                 │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
           ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
           ▒                                             ▒
           ▒   ┌───────────────────────────────────┐    ▒
           ▒   │                                   │    ▒
           ▒   │    Programming & Development      │    ▒
           ▒   │                                   │    ▒
           ▒   ├───────────────────────────────────┤    ▒
           ▒   │                                   │    ▒
           ▒   │ • JavaScript ES2022 Features      │    ▒
           ▒   │   stackoverflow.com/js-features   │    ▒
           ▒   │                                   │    ▒
           ▒   │ • React Hooks Best Practices      │    ▒
           ▒   │   github.com/reactjs/hooks-guide │    ▒
           ▒   │                                   │    ▒
           ▒   │ • TypeScript Advanced Types       │    ▒
           ▒   │   typescriptlang.org/advanced     │    ▒
           ▒   │                                   │    ▒
           ▒   │                        [Close] [X]│    ▒
           ▒   └───────────────────────────────────┘    ▒
           ▒                                             ▒
           ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒
```
*Note: The dotted area (▒) represents the dimmed background overlay*

## Component Hierarchy

```
NewTabPage
└── SearchBar
└── ClusterContainer
    ├── ClusterSquare (x3)
    │   ├── ClusterTitle
    │   └── EmptyStateMessage (conditional)
    └── ModalOverlay (appears on click)
        ├── DimmedBackground
        └── ExpandedClusterView
            ├── ClusterHeader
            ├── PageList
            │   └── PageItem (multiple)
            │       ├── PageTitle
            │       └── PageUrl
            └── CloseButton
```

## States and Behaviors

### ClusterSquare
- **Default State**: Displays the cluster name or "Still learning" message
- **Loading State**: Shows a subtle loading indicator when fetching cluster data
- **Hover State**: Slight elevation/highlight to indicate interactivity
- **Click Behavior**: Triggers the modal overlay with expanded view

### ModalOverlay and ExpandedClusterView
- **Position**: Centered on the screen with dimmed background overlay
- **Background**: Semi-transparent dark overlay that dims the content beneath
- **Animation**: Smooth fade-in transition for both the overlay and expanded view
- **Close Behavior**: Clicking outside the expanded view, the close button, or pressing ESC closes it
- **Scrolling**: If many pages exist in the cluster, the list should be scrollable while keeping the modal centered

## Responsive Behavior

- On smaller screens, the three squares may stack vertically
- The modal expanded view should adjust its width based on screen dimensions
- On mobile devices, the expanded view could take up most of the screen area while maintaining margins

## Empty States

1. **No Clusters Available**: All squares show "Still learning..."
2. **Partial Clusters**: Some squares show clusters, others show "Still learning..."
3. **Error State**: If there's an error fetching clusters, display a subtle error message with retry option

## Accessibility Considerations

- All interactive elements should be keyboard accessible
- Proper ARIA attributes for screen readers (aria-modal="true" for the overlay)
- Sufficient color contrast for readability
- Focus trap within the modal when it's open
- Focus states for keyboard navigation 