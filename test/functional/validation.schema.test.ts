// ----------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.  All rights reserved.
// ----------------------------------------------------------------------------

import { testDiagnostics, testDiagnosticsFromFile } from "../support/diagnostics";

suite("Schema validation", () => {
    // TODO: ignore backend error
    test("missing required property 'resources'", async () =>
        await testDiagnostics(
            {
                $schema: "https://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
                contentVersion: "1.2.3.4"
            },
            {},
            [
                "Warning: Missing required property resources (ARM Language Server)",
                "Error: Template validation failed: Required property 'resources' not found in JSON. Path '', line 4, position 1. (ARM Language Server)"
            ])
    );

    test(
        "networkInterfaces 2018-10-01",
        async () =>
            await testDiagnosticsFromFile(
                'templates/networkInterfaces.json',
                {
                    search: /{{apiVersion}}/,
                    replace: "2018-10-01"
                },
                [])
    );

    test(
        "https://github.com/Azure/azure-resource-manager-schemas/issues/627",
        async () =>
            await testDiagnosticsFromFile(
                'templates/networkInterfaces.json',
                {
                    search: /{{apiVersion}}/,
                    replace: "2018-11-01"
                },
                [])
    );

    suite("Case-insensitivity", async () => {
        /* TODO: enable when fixed
        test(
            'Resource type miscapitalized (https://github.com/microsoft/vscode-azurearmtools/issues/238)',
            async () =>
                await testDiagnostics(
                    {
                        resources: [
                            {
                                name: "example",
                                type: "Microsoft.Network/publicIpAddresses",
                                apiVersion: "2018-08-01",
                                location: "westus",
                                properties: {},
                            }]
                    },
                    {},
                    [
                    ])
        );*/
    });
});
